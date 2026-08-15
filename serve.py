#!/usr/bin/env python3
"""Раздаёт Обвод из папки, где лежит этот файл — не из текущей cwd."""

from __future__ import annotations

import os
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent
HOST = os.environ.get("HOST", "127.0.0.1")
PORT = int(os.environ.get("PORT", "8765"))
INDEX = ROOT / "index.html"


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def _bare_path(self) -> str:
        path = self.path.split("?", 1)[0].rstrip("/") or "/"
        return path

    def _serve_favicon(self) -> bool:
        if self._bare_path() != "/favicon.ico":
            return False
        self.send_response(204)
        self.end_headers()
        return True

    def do_GET(self):
        if self._serve_favicon():
            return
        super().do_GET()

    def do_HEAD(self):
        if self._serve_favicon():
            return
        super().do_HEAD()

    def send_error(self, code, message=None, explain=None):
        if code != 404:
            super().send_error(code, message, explain)
            return
        body = (
            "<!DOCTYPE html><html lang='ru'><head><meta charset='utf-8'>"
            "<title>Обвод</title></head>"
            "<body style='font-family:sans-serif;background:#0b1220;color:#e8f6ff;"
            "padding:2rem;max-width:40rem'>"
            "<h1>Это не страница игры</h1>"
            "<p>Сервер живой, но по этому адресу файла нет.</p>"
            f"<p>Открой <a href='/' style='color:#5eead4'>http://{HOST}:{PORT}/</a></p>"
            f"<p style='color:#9bb0c9'>Корень раздачи: {ROOT}</p>"
            "<p>На своём компьютере не указывай <code>--directory /workspace</code> "
            "— этой папки у тебя нет. Запускай <code>python3 serve.py</code> "
            "из клона репозитория (рядом с <code>index.html</code>).</p>"
            "</body></html>"
        ).encode("utf-8")
        self.send_response(404)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def main() -> int:
    if not INDEX.is_file():
        print(f"Нет {INDEX}. Этот скрипт должен лежать рядом с index.html.", file=sys.stderr)
        return 1
    httpd = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"Обвод: http://{HOST}:{PORT}/  (файлы из {ROOT})")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nстоп")
        return 0
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
