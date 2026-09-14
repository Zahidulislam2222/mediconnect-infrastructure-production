import { BatchWriteCommand, QueryCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { DeleteObjectsCommand, GetObjectCommand, ListObjectVersionsCommand } from '@aws-sdk/client-s3';

export interface PrivacyLimits { maxPages: number; batchAttempts: number; retryDelayMs: number }
export type CommandSender = { send(command: any): Promise<any> };

/** Scoped to rights operations; paginates reads and verifies every batch write. */
export function completePrivacyClient(client: CommandSender, limits: PrivacyLimits): CommandSender {
  return { async send(command) {
    if (command instanceof QueryCommand || command instanceof ScanCommand) {
      const items: unknown[] = [];
      let key = command.input.ExclusiveStartKey;
      const seen = new Set<string>();
      for (let page = 0; page < limits.maxPages; page++) {
        const next = command instanceof QueryCommand
          ? new QueryCommand({ ...command.input, ExclusiveStartKey: key })
          : new ScanCommand({ ...command.input, ExclusiveStartKey: key });
        const response = await client.send(next);
        items.push(...(response.Items || []));
        key = response.LastEvaluatedKey;
        if (!key || Object.keys(key).length === 0) return { ...response, Items: items, LastEvaluatedKey: undefined };
        const signature = JSON.stringify(key);
        if (seen.has(signature)) throw new Error('PRIVACY_PAGINATION_STALLED');
        seen.add(signature);
      }
      throw new Error('PRIVACY_PAGE_LIMIT_REQUIRES_CONTINUATION');
    }
    if (command instanceof BatchWriteCommand) {
      let pending = command.input.RequestItems;
      for (let attempt = 0; attempt < limits.batchAttempts; attempt++) {
        const response = await client.send(new BatchWriteCommand({ ...command.input, RequestItems: pending }));
        pending = response.UnprocessedItems;
        if (!pending || Object.values(pending).every(items => !Array.isArray(items) || items.length === 0)) return response;
        if (attempt + 1 < limits.batchAttempts) await new Promise(resolve => setTimeout(resolve, limits.retryDelayMs * 2 ** attempt));
      }
      throw new Error('PRIVACY_UNPROCESSED_WRITES');
    }
    return client.send(command);
  } };
}

/** Lists versions, including delete-only keys, instead of relying on the current object listing. */
export async function listPrivacyVersions(client: CommandSender, bucket: string, prefix: string, limits: PrivacyLimits) {
  let keyMarker: string | undefined;
  let versionMarker: string | undefined;
  const seen = new Set<string>();
  const versions: { Key: string; VersionId: string; deleteMarker: boolean }[] = [];
  for (let page = 0; page < limits.maxPages; page++) {
    const response = await client.send(new ListObjectVersionsCommand({ Bucket: bucket, Prefix: prefix, KeyMarker: keyMarker, VersionIdMarker: versionMarker }));
    for (const [items, deleteMarker] of [[response.Versions || [], false], [response.DeleteMarkers || [], true]] as const) {
      for (const item of items) {
        if (!item.Key || !item.VersionId) throw new Error('PRIVACY_INVALID_VERSION_LIST');
        versions.push({ Key: item.Key, VersionId: item.VersionId, deleteMarker });
      }
    }
    if (!response.IsTruncated) return versions;
    keyMarker = response.NextKeyMarker;
    versionMarker = response.NextVersionIdMarker;
    const marker = JSON.stringify([keyMarker, versionMarker]);
    if (!keyMarker || seen.has(marker)) throw new Error('PRIVACY_VERSION_PAGINATION_STALLED');
    seen.add(marker);
  }
  throw new Error('PRIVACY_PAGE_LIMIT_REQUIRES_CONTINUATION');
}

async function deletePrivacyVersions(client: CommandSender, bucket: string, objects: { Key: string; VersionId: string }[]) {
  // S3 DeleteObjects protocol maximum is 1000 objects per request.
  for (let start = 0; start < objects.length; start += 1000) {
    const deleted = await client.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: objects.slice(start, start + 1000), Quiet: true } }));
    if (deleted.Errors?.length) throw new Error('PRIVACY_OBJECT_DELETE_INCOMPLETE');
  }
}

export async function eraseS3Versions(client: CommandSender, bucket: string, prefix: string, limits: PrivacyLimits, exactKey = false) {
  // Finish listing before deletion: a continuation marker must not refer to a version already removed by this operation.
  const versions = await listPrivacyVersions(client, bucket, prefix, limits);
  await deletePrivacyVersions(client, bucket, versions.filter(item => !exactKey || item.Key === prefix).map(({ Key, VersionId }) => ({ Key, VersionId })));
}

/** Known DLQ schemas only. Mixed-subject/ambiguous payloads require controlled reconciliation. */
export async function eraseSubjectDlqVersions(client: CommandSender, bucket: string, prefix: string, subjectIds: string[], limits: PrivacyLimits) {
  const versions = await listPrivacyVersions(client, bucket, prefix, limits);
  const owned: { Key: string; VersionId: string }[] = [];
  for (const version of versions.filter(item => !item.deleteMarker)) {
    const response = await client.send(new GetObjectCommand({ Bucket: bucket, Key: version.Key, VersionId: version.VersionId }));
    const body = await response.Body?.transformToString();
    if (!body) throw new Error('PRIVACY_DLQ_UNREADABLE');
    const data = JSON.parse(body);
    const rows = data.rows ?? data.data;
    if (!Array.isArray(rows) || rows.some(row => !row || typeof (row.patient_id ?? row.patientId) !== 'string')) {
      throw new Error('PRIVACY_DLQ_SCHEMA_REQUIRES_RECONCILIATION');
    }
    const matches = rows.filter(row => subjectIds.includes(row.patient_id ?? row.patientId));
    if (matches.length && matches.length !== rows.length) throw new Error('PRIVACY_DLQ_MIXED_SUBJECT_REQUIRES_RECONCILIATION');
    if (matches.length) owned.push({ Key: version.Key, VersionId: version.VersionId });
    else if (subjectIds.some(id => body.includes(id))) throw new Error('PRIVACY_DLQ_METADATA_REQUIRES_RECONCILIATION');
  }
  await deletePrivacyVersions(client, bucket, owned);
}

export interface ErasureProgress {
  requestId: string;
  state: 'IN_PROGRESS' | 'RETRY_REQUIRED' | 'REVIEW_REQUIRED' | 'COMPLETED';
  completed: string[];
  failedStage?: string;
  requestedAt: string;
}

export class ErasureWorkflow {
  constructor(public progress: ErasureProgress, private persist: (value: ErasureProgress) => Promise<void>) {}
  async stage(name: string, operation: () => Promise<void>) {
    if (this.progress.completed.includes(name)) return;
    try {
      await operation();
      this.progress = { ...this.progress, state: 'IN_PROGRESS', completed: [...this.progress.completed, name], failedStage: undefined };
      await this.persist(this.progress);
    } catch (error) {
      this.progress = { ...this.progress, state: 'RETRY_REQUIRED', completed: this.progress.completed.filter(stage => stage !== name), failedStage: name };
      await this.persist(this.progress);
      throw error;
    }
  }
}
