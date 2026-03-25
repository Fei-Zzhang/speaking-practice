#!/usr/bin/env python3
"""
一次性从 docx 生成项目根目录的 practice-bank.cache.json。
前端 standalone 会优先请求该文件，Interview 题库可秒开；与 Python 进程内磁盘缓存为同一文件。

用法（在 oral-python-backend 目录）:
  python export_practice_bank_cache.py
"""
import os
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, _HERE)

from app import _build_practice_bank, _practice_bank_paths, _save_practice_bank_to_disk  # noqa: E402

if __name__ == "__main__":
    data = _build_practice_bank()
    _, _, _, cache_path = _practice_bank_paths()
    _save_practice_bank_to_disk(cache_path, data)
    print("已写入:", cache_path)
