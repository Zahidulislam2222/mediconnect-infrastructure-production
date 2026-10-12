The optional `cms_media_identity` input prepares one IAM user and one inline policy for an existing CMS media bucket. Its default is `null`, which creates neither resource. IAM is global, so this identity is declared once; the bucket's existing region remains CMS runtime configuration.

The policy permits media object reads, writes and deletion plus bucket/multipart metadata over TLS. It grants no ACL, bucket-policy, IAM, database or other-service permissions. The existing bucket is public editorial storage; do not put patient data in it. Do not attach additional policies or groups to this workload user.

Set the four deployment values in an ignored private `.tfvars` file using the example. Before an owner-approved apply, inspect a saved targeted plan and require exactly two IAM creates, no updates or deletes, and the expected existing bucket ARN. Targeted plans do not establish whole-environment parity. Preserve the current state and provider inventory privately.

No access-key resource or secret output is declared. After separate authorization, create one access key for this user, record the complete value in the ignored project credential recovery file, and install it through the private CMS runtime environment. Never pass the secret in command arguments, print it, commit it or send it to a reviewer. Preserve the invalid legacy credential as a labeled recovery reference.

Verify allowed media actions and denied other-bucket, ACL and unrelated-service actions before activation. Keep the original database, media and deployment artifacts for rollback. Retire only the newly created key/user under an explicit rollback approval; `force_destroy` remains false to protect unmanaged credentials.
