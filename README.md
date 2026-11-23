# Pigeon

Pigeon is an extremely simple file sharing service for self hosting.

## Deploy

You can download from [releases](https://github.com/mebtte/pigeon/releases) and start the service:

```sh
pigeon --data path_to/data --user 'user1:password1' --user 'user2:password2'
```

Then you can view it on "http://localhost:3000". Also you can use docker.

### Docker CLI

```sh
docker run -d --name pigeon \
  -p 3000:3000 \
  -v pigeon-data:/data \
  mebtte/pigeon:v0 \
  --data /data --user 'user1:password1'
```

### Docker Compose

```yaml
services:
  pigeon:
    image: mebtte/pigeon:v0
    ports:
      - 3000:3000
    volumes:
      - path_to/data:/data
    command: ["--data", "/data", "--user", "user1:password1"]
```

## Usage

```console
$ pigeon -h
Pigeon is an extremely simple file sharing service for self hosting.

Usage: pigeon [OPTIONS]

Options:
      --user <USERNAME:PASSWORD>  Login account; repeat to add users
      --port <PORT>               HTTP port [default: 3000]
      --base-path <BASE_PATH>     Public deployment path [default: /]
      --max-file-size <SIZE>      Maximum upload file size, e.g. 500MB or 2GB. Omit for unlimited.
      --data <DATA>               Persistent files and SQLite database [default: ./pigeon-data]
  -h, --help                      Print help
  -V, --version                   Print version
```

## License

Pigeon is licensed under the [GNU General Public License v3.0](LICENSE) (`GPL-3.0-only`).
