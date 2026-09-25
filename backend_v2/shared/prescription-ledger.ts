import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import type { DynamoDBDocumentClient, QueryCommandOutput } from "@aws-sdk/lib-dynamodb";

/** A ledger row as the document client returns it. */
export type LedgerRow = NonNullable<QueryCommandOutput["Items"]>[number];

/** Every ledger row of a prescription. The ledger has no reference index, so bills are found through the patient index. */
export async function findPrescriptionBills(docClient: Pick<DynamoDBDocumentClient, "send">, table: string,
    patientId: string, prescriptionId: string): Promise<LedgerRow[]> {
    const bills: LedgerRow[] = [];
    let page: QueryCommandOutput["LastEvaluatedKey"];
    do {
        const result: QueryCommandOutput = await docClient.send(new QueryCommand({
            TableName: table,
            IndexName: "PatientIndex",
            KeyConditionExpression: "patientId = :pid",
            FilterExpression: "referenceId = :rid",
            ExpressionAttributeValues: { ":pid": patientId, ":rid": prescriptionId },
            ExclusiveStartKey: page
        }));
        bills.push(...(result.Items || []));
        page = result.LastEvaluatedKey;
    } while (page);
    return bills;
}
