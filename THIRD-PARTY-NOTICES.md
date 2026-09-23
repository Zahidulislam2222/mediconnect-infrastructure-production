# Third-party notices

The MIT Licence in [LICENSE](LICENSE) covers the original source code in this repository written for
MediConnect. It does **not** relicense third-party material. Each third-party component below keeps
its own licence and copyright.

## Software dependencies

- Node.js packages in `backend_v2/**/package.json` and `package-lock.json`, and Python packages in
  `requirements.txt` files, keep their own licences.
- `legacy_lambdas/` contains **vendored** Python libraries (for example Google API clients, protobuf,
  requests, urllib3, rsa, pyasn1, dnspython, pymongo, psycopg2). Their licence files are kept beside
  them in each `*.dist-info/` folder. Some of those libraries contain sample keys and test vectors that
  secret scanners flag; they belong to the upstream projects and are not MediConnect credentials.
- Terraform providers and modules are downloaded at `terraform init` time under their own licences.
- Container base images named in Dockerfiles keep their own licences.
