"""Send a command to the isolated headless acceptance guest without host focus."""
import argparse
from pathlib import Path
import time
import win32com.client

parser = argparse.ArgumentParser()
parser.add_argument("operation", choices=["run", "text", "enter", "escape"])
parser.add_argument("value", nargs="?")
args = parser.parse_args()
vbox = win32com.client.gencache.EnsureDispatch("VirtualBox.VirtualBox")
machine = vbox.FindMachine("SecureOrcaLite-Win10-Test")
session = win32com.client.Dispatch("VirtualBox.Session")
machine.LockMachine(session, 1)
try:
    keyboard = session.Console.Keyboard
    if args.operation == "run":
        keyboard.PutScancodes([0xE0, 0x5B, 0x13, 0x93, 0xE0, 0xDB])
    elif args.operation == "enter":
        keyboard.PutScancodes([0x1C, 0x9C])
    elif args.operation == "escape":
        keyboard.PutScancodes([0x01, 0x81])
    else:
        value = Path(args.value).read_text(encoding="utf-8-sig").strip()
        keys = dict(zip('1234567890', range(2, 12)))
        keys.update(zip('qwertyuiop', range(0x10, 0x1A)))
        keys.update(zip('asdfghjkl', range(0x1E, 0x27)))
        keys.update(zip('zxcvbnm', range(0x2C, 0x33)))
        keys.update({' ': 0x39, '-': 0x0C, '=': 0x0D, '[': 0x1A, ']': 0x1B, '\\': 0x2B, ';': 0x27, "'": 0x28, ',': 0x33, '.': 0x34, '/': 0x35, '`': 0x29})
        shifted = dict(zip('!@#$%^&*()', '1234567890'))
        shifted.update(dict(zip('_+{}|:"<>?~', '-=[]\\;\',./`')))
        for character in value:
            code = keys[shifted.get(character, character.lower())]
            shift = character in shifted or character.isupper()
            keyboard.PutScancodes(([0x2A] if shift else []) + [code, code | 0x80] + ([0xAA] if shift else []))
            time.sleep(0.05)
finally:
    session.UnlockMachine()
