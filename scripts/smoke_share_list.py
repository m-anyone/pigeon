"""Verify owner-only share listing and deletion on a local Pigeon binary."""

import argparse
import json
from pathlib import Path
from urllib.parse import urlencode

from smoke_release import (
    BASE,
    PASSWORD,
    PAYLOAD,
    SHARE_PASSWORD,
    USERNAME,
    post_json,
    request,
    share_id_from_url,
    start_standalone,
    upload_file,
)

SECOND_USER = "smoke-colleague"
ACCOUNTS = ((USERNAME, PASSWORD), (SECOND_USER, "colleague-password"))
QUERY = "rEpOrT_100%"


def list_path(page):
    query = urlencode({"q": QUERY, "page": page, "page_size": 2})
    return f"{BASE}/api/shares?{query}"


def list_page(origin, token, page):
    _, data = request(origin, list_path(page), headers={"X-Pigeon-Token": token})
    assert SHARE_PASSWORD.encode() not in data, "Share list disclosed the password"
    assert token.encode() not in data, "Share list disclosed the session token"
    response = json.loads(data)
    assert response["page"] == page, response
    assert response["page_size"] == 2, response
    return response


def check_share_list(origin):
    request(origin, list_path(1), status=401)
    request(origin, list_path(1), headers={"X-Pigeon-Token": "invalid"}, status=401)
    tokens = {
        username: post_json(
            origin, f"{BASE}/api/sessions", {"username": username, "password": password}
        )["token"]
        for username, password in ACCOUNTS
    }


    protected_file = "Report_100%.txt"
    deleted_file = "REPORT_100% photo.bin"
    matches = (protected_file, "report_100% notes.txt", deleted_file)
    protected_fields = {
        "password": SHARE_PASSWORD,
        "expiry_days": "7",
        "max_downloads": "1",
    }
    owner = tokens[USERNAME]
    colleague = tokens[SECOND_USER]
    urls = {
        filename: upload_file(
            origin,
            owner,
            filename=filename,
            fields=protected_fields if filename == protected_file else {},
        )
        for filename in matches
    }
    # Both distractors belong to the owner to exercise literal search independently.
    for filename in ("reportX100%.txt", "report_100x.txt"):
        upload_file(origin, owner, filename=filename, fields={})
    colleague_file = "report_100% colleague.txt"
    colleague_url = upload_file(origin, colleague, filename=colleague_file, fields={})

    first = list_page(origin, owner, 1)
    second = list_page(origin, owner, 2)
    assert first["total"] == second["total"] == len(matches), (first, second)
    assert len(first["items"]) == 2 and len(second["items"]) == 1, (first, second)
    other = list_page(origin, colleague, 1)
    assert other["total"] == 1, other
    assert [item["filename"] for item in other["items"]] == [colleague_file], other
    assert other["items"][0]["share_url"] == colleague_url, other

    items = first["items"] + second["items"]
    assert {item["filename"] for item in items} == set(matches), items
    for item in items:
        assert set(item) == {
            "id",
            "filename",
            "size_bytes",
            "created_at",
            "expires_at",
            "remaining_downloads",
            "requires_password",
            "share_url",
        }, item.keys()
        filename = item["filename"]
        protected = filename == protected_file
        assert item["share_url"] == urls[filename], item
        assert item["id"] == share_id_from_url(urls[filename]), item
        assert item["size_bytes"] == len(PAYLOAD), item
        assert item["requires_password"] is protected, item
        assert isinstance(item["created_at"], int) and item["created_at"] > 0, item
        assert item["remaining_downloads"] == (1 if protected else None), item
        if protected:
            assert item["expires_at"] - item["created_at"] == 7 * 86400, item

    deleted_id = share_id_from_url(urls[deleted_file])
    delete_path = f"{BASE}/api/shares/{deleted_id}"
    request(origin, delete_path, method="DELETE", status=401)
    request(
        origin, delete_path, method="DELETE", headers={"X-Pigeon-Token": colleague}, status=404
    )
    coupon = post_json(origin, f"{delete_path}/download-links", {}, status=201)
    direct_url = coupon["download_url"]
    assert request(origin, direct_url)[1] == PAYLOAD
    request(origin, delete_path, method="DELETE", headers={"X-Pigeon-Token": owner}, status=204)
    request(origin, delete_path, status=404)
    request(origin, direct_url, status=404)
    request(origin, delete_path, method="DELETE", headers={"X-Pigeon-Token": owner}, status=404)
    remaining = list_page(origin, owner, 1)
    assert remaining["total"] == 2, remaining
    assert {item["filename"] for item in remaining["items"]} == (
        set(matches) - {deleted_file}
    ), remaining

    protected_id = share_id_from_url(urls[protected_file])
    protected_path = f"{BASE}/api/shares/{protected_id}"
    post_json(
        origin,
        f"{protected_path}/download-links",
        {"password": SHARE_PASSWORD},
        status=201,
    )
    request(origin, protected_path, status=404)
    available = list_page(origin, owner, 1)
    assert available["total"] == 1, available
    assert {item["filename"] for item in available["items"]} == (
        set(matches) - {protected_file, deleted_file}
    ), available


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("binary", type=Path)
    args = parser.parse_args()
    with start_standalone(args.binary.resolve(strict=True), accounts=ACCOUNTS) as origin:
        check_share_list(origin)
    print("Owner-only share listing and deletion smoke test passed")


if __name__ == "__main__":
    main()
