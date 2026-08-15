#!/usr/bin/env python3
import json
import os
import sys

event = json.load(sys.stdin)

if not os.path.exists(".cursor/LOOP_ON"):
    print("{}")
    sys.exit(0)

if event.get("status") != "completed":
    print("{}")
    sys.exit(0)

if os.path.exists(".cursor/LOOP_DONE"):
    if os.path.exists(".cursor/LOOP_ON"):
        os.remove(".cursor/LOOP_ON")
    print("{}")
    sys.exit(0)

iteration = event.get("loop_count", 0) + 1

prompt = f"""
GAMEPLAY ITERATION {iteration}/10

Игра — «Обвод». Отвечай на русском.
Сначала прочитай GAME_DESIGN.md, PROTOTYPE_SPEC.md и ITERATION_LOG.md.

1. Подними python3 -m http.server 8765, если ещё не запущен.
   Открой http://127.0.0.1:8765/ (и ?demo=1, ?selfcheck=1).
   Обязательно проверь в environment: Browser/Chrome screenshot + самопроверки правил.
   Походи WASD, замкни контур, посмотри отмирание и цвет.

2. Найди ОДНУ самую важную сейчас проблему:
   - blocking bug;
   - глагол «закрыть/тянуть/бросить» не читается;
   - скучный кусок core loop;
   - сломанный баланс (микрокруги, периметр, ферма входа, мгновенный проигрыш, слишком легко);
   - визуал серый / нечитаемый / некрасочный, если gameplay уже держится.

3. Сделай одно изменение с максимальным влиянием.
   Не возвращай 3v3, бойцов, супер, арену, ядро, оружие.
   Не добавляй системы сверх черты / интерьера / памяти дома.
   Приоритет: сначала глагол и баланс, затем обратная связь, затем красочность.

4. Снова screenshot + самопроверки.

5. Допиши ITERATION_LOG.md: что было не так, что изменено, почему, что увидел в environment, что остаётся самым слабым.

6. Закоммить и запушь. Если это итерация 10 или гипотеза жива (контур читается, отмирание давит, тень меняет второй забег, картинка цветная) и дальше только вкус — создай .cursor/LOOP_DONE.

Не создавай LOOP_DONE только потому что страница открывается.
"""

print(json.dumps({"followup_message": prompt}, ensure_ascii=False))
