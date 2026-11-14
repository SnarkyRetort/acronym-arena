"""Curated, non-automatically-generated Acro Arena starter themes."""
THEMES = {
'Movies & TV': [
'Rejected horror movie titles','The worst sitcom ever made','Movies that should never have sequels','Terrible reality TV shows','Rejected superhero movie titles','The worst documentary subjects','Movies made by incompetent aliens','Awful children’s TV shows','Titles of movies nobody would watch','Disastrous movie remakes'],
'Workplace Disasters': [
'Things you should never say to your boss','Reasons to get fired immediately','Terrible company slogans','Worst job interview answers','Jobs that should not exist','Disastrous team-building exercises','Things overheard in HR','The worst employee benefits','Excuses for being late to work','Rejected corporate mission statements'],
'Romance & Relationships': [
'The world’s worst pickup lines','Terrible dating advice','Reasons for an immediate breakup','Things never to say on a first date','Awful wedding vows','Rejected dating app slogans','The worst anniversary gifts','Things overheard at divorce court','Terrible romantic gestures','Reasons to cancel a wedding'],
'Space & Sci-Fi': [
'Things aliens find confusing','Rejected spaceship names','Terrible first-contact greetings','Reasons your spaceship exploded','The worst planetary discoveries','Things prohibited aboard a space station','Awful intergalactic laws','Rejected robot personalities','Things astronauts should not say','The worst alien inventions'],
'Crime & Bad Decisions': [
'The world’s dumbest criminals','Terrible bank robbery plans','Things you should not tell a judge','Awful criminal nicknames','Rejected supervillain schemes','The worst prison escape plans','Things found at a suspicious crime scene','Terrible courtroom defenses','The world’s least intimidating threats','Reasons the police were called'],
'Food & Disasters': [
'The world’s worst restaurant names','Foods that should be illegal','Things never to put on pizza','Rejected fast-food slogans','Disastrous cooking show titles','Things found in the refrigerator','The worst breakfast combinations','Restaurants with terrible customer service','The world’s most suspicious ingredients','Things you should not serve at Thanksgiving'],
'History & Politics': [
'Things a king should never announce','Terrible presidential campaign slogans','Reasons an empire collapsed','The worst historical inventions','Rejected names for countries','Things overheard in ancient Rome','The worst diplomatic greetings','Disastrous royal decrees','Things not to say during a revolution','The least impressive historical battles'],
'Magic & Mythology': [
'Rejected names for Greek gods','The worst supernatural powers','Things ghosts complain about','Terrible prophecies','Reasons a wizard lost his license','Things overheard in the underworld','The worst magical curses','Rejected names for demons','Reasons the gods are disappointed','Things you should not summon'],
'Absurd & Surreal': [
'Things that should never be sentient','The world’s most useless inventions','Terrible advice from a talking animal','Reasons gravity stopped working','Things found in another dimension','The worst possible superpowers','Rejected laws of physics','Things overheard at the end of the universe','Disastrous time-travel destinations','Things nobody should ever Google'],
'Social Chaos': [
'Things you should not say at a funeral','The worst excuses ever invented','Things overheard in a public bathroom','Reasons a party was canceled','The worst things to say to your neighbors','Terrible advice from your grandparents','Things people lie about on the internet','The worst possible apologies','Reasons you were banned from a store','Things nobody should admit out loud']
}
assert len(THEMES) == 10 and sum(map(len,THEMES.values())) == 100
