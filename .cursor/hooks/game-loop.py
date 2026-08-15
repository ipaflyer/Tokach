#!/usr/bin/env python3
import json
import os
import sys

event = json.load(sys.stdin)

# Loop выключен
if not os.path.exists(".cursor/LOOP_ON"):
    print("{}")
    sys.exit(0)

# Не продолжаем после ошибки/ручной остановки
if event.get("status") != "completed":
    print("{}")
    sys.exit(0)

# Agent решил, что цикл закончен
if os.path.exists(".cursor/LOOP_DONE"):
    if os.path.exists(".cursor/LOOP_ON"):
        os.remove(".cursor/LOOP_ON")

    print("{}")
    sys.exit(0)

iteration = event.get("loop_count", 0) + 1

prompt = f"""
GAMEPLAY ITERATION {iteration}

Игра сменилась. Это не «Толкач». Текущая игра — «Осадок».
Отвечай на русском.

Сначала прочитай GAME_DESIGN.md и PROTOTYPE_SPEC.md.

Сейчас фаза концепции, не реализации:
- не пиши игровой код;
- не проектируй интерфейс;
- не итерируй HTML-прототип Толкача;
- не добавляй механики сверх переработанной концепции.

Если в GAME_DESIGN.md дыра в фантазии, core loop, развилке «срыв / рельс / перехват» или в поломке новичок/опытный/min-maxer/эксплойтер — закрой ОДНУ дыру правкой концепции.
Не расширяй ростер, режимы и статусы.

Если гипотеза и признаки живой/мёртвой игры уже сформулированы, а без плейтеста дальше только вкус — создай файл .cursor/LOOP_DONE.
"""

print(json.dumps({"followup_message": prompt}, ensure_ascii=False))
