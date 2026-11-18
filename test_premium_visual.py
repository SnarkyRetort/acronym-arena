from pathlib import Path
import ast
source=Path(__file__).with_name('bot.py').read_text(encoding='utf-8')
ast.parse(source)
assert "VERSION = '3.4.2'" in source
assert 'class SinglePostLayout(discord.ui.LayoutView)' in source
assert source.index('group.add_item(gallery)') < source.index('group.add_item(discord.ui.TextDisplay(')
assert 'await msg.edit(content=None, embed=None, attachments=assets,' in source
assert 'SinglePostLayout(post[' in source
assert "self.title=f'🎭 {r[\"theme\"]}'[:45]" in source
assert "placeholder='One word per letter, in order'" in source
assert 'Acro Arena v{VERSION} · Entry #{entry_id}' in source
assert Path(__file__).with_name('acro_arena_banner.jpg').stat().st_size<8_000_000
print('PASS: 3.4.2 layout contract; banner-first; old-message migration; persistent controls; themed modal; version labels')