"""Static visual-upgrade contract; doesn't require Discord credentials."""
import ast
from pathlib import Path
source=Path(__file__).with_name('bot.py').read_text()
tree=ast.parse(source)
assert 'GOLD=0xE9B84D' in source and 'PURPLE=0x7651D5' in source
assert 'async def send_premium' in source and 'async def edit_premium' in source
assert 'attachments=list(msg.attachments)+[banner_file()]' in source
assert 'await edit_premium(message, single_post_embed(rid), SinglePostView(rid))' in source
assert 'await send_premium(channel, single_post_embed(rid), SinglePostView(rid))' in source
assert "em.set_image(url='attachment://'+BANNER_NAME)" in source
assert 'self.theme_options=list(options)' in source
assert 'self.children[0].themes' not in source
assert Path(__file__).with_name('acro_arena_banner.jpg').stat().st_size<8_000_000
print('PASS: premium banner present; edit-in-place; persistent controls; theme auto-select repair')