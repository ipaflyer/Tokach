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

Игра — «Обвод», не «Толкач» и не «Осадок».
Отвечай на русском.

Сначала прочитай GAME_DESIGN.md и PROTOTYPE_SPEC.md.

Сейчас фаза концепции, не реализации:
- не пиши игровой код;
- не проектируй интерфейс;
- не итерируй HTML-прототип Толкача;
- не возвращай 3v3, бойцов, супер, арену, ядро;
- не добавляй механики сверх переработанной концепции.

Если в GAME_DESIGN.md дыра в фантазии, core loop, развилке «закрыть / тянуть / бросить» или в поломке новичок/опытный/min-maxer/эксплойтер — закрой ОДНУ дыру правкой концепции.
Не расширяй ростер, оружие и кооп.

Если гипотеза уже сформулирована, а без плейтеста дальше только вкус — создай файл .cursor/LOOP_DONE.
"""

print(json.dumps({"followup_message": prompt}, ensure_ascii=False))
