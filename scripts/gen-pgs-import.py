#!/usr/bin/env python3
# Generates the Play Games Services ACHIEVEMENTS bulk-import ZIP.
# Drop the resulting store/pgs-import/achievements-import.zip into
#   Play Console -> Play Games Services -> Achievements -> Import achievements.
#
# ZIP contents (flat, no header rows in the CSVs — the PGS importer forbids them,
# and it also can't parse commas inside fields, so names/descriptions are kept
# comma-free):
#   AchievementsMetadata.csv       Name, Description, Incremental, Steps, InitialState, Points, ListOrder
#   AchievementsIconsMappings.csv  Name, iconFilename
#   ACH_*.png                      the 27 achieved icons (512x512, from store/pgs-achievements/)
# NOTE: no AchievementsLocalizations.csv — that file is ONLY for locales other than
# the game's default (en-US), so an en-US row there is rejected ("Wrong locale").
# The default-locale text lives in AchievementsMetadata.csv's Name/Description.
#
# After importing, use the console's "Get resources" to grab every generated ID.

import csv, os, shutil, zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ICON_SRC = os.path.join(ROOT, 'store', 'pgs-achievements')
OUT_DIR = os.path.join(ROOT, 'store', 'pgs-import')
STAGE = os.path.join(OUT_DIR, '_stage')

# key = internal ACH id (matches src/js/pgs-ids.js + the icon filename ACH_<key>.png)
# name = display name (also the CSV linking key; unique, comma-free)
# desc = description (comma-free — the importer can't handle commas)
# pts, order, hidden
ACH = [
    ('ACH_FIRST_DELIVERY', 'First Delivery',        'Reach level 5 in a run.',                        20,  1, False),
    ('ACH_SAUCE_SLINGER',  'Saucy',                 'Defeat the Sauce Slinger.',                      20,  2, False),
    ('ACH_HAMMER_CHEF',    'Tenderized',            'Defeat the Hammer Chef.',                        35,  3, False),
    ('ACH_WARLORD',        'Employee of the Month', 'Defeat the Warlord.',                            35,  4, False),
    ('ACH_TRIPLE_THREAT',  'Triple Threat',         'Defeat all three bosses in one run.',            45,  5, False),
    ('ACH_WIN_NORMAL',     'Well Done',             'Win a run on Normal.',                           35,  6, False),
    ('ACH_WIN_HARD',       'Extra Crispy',          'Win a run on Hard.',                             45,  7, False),
    ('ACH_WIN_EXTREME',    'Burnt to a Crisp',      'Win a run on Extreme.',                          60,  8, False),
    ('ACH_LEVEL_50',       'Getting Warmed Up',     'Reach level 50 in a run.',                       20,  9, False),
    ('ACH_LEVEL_150',      'Fully Stacked',         'Reach level 150 in a run.',                      35, 10, False),
    ('ACH_LEVEL_300',      'Overcooked',            'Reach level 300 in a run.',                      60, 11, False),
    ('ACH_FULL_LOADOUT',   'The Works',             'Carry a full 3/3/3 loadout at once.',            35, 12, False),
    ('ACH_MAX_WEAPON',     'Perfected Recipe',      'Max out any weapon.',                            35, 13, False),
    ('ACH_GOLD_2500',      'Big Tipper',            'Hold 2500 gold in a single run.',                20, 14, False),
    ('ACH_RUSH_HOUR',      'Rush Hour',             'Defeat 5000 enemies in a single run.',           45, 15, False),
    ('ACH_KILLS_100000',   'Meat Grinder',          'Defeat 100K enemies (lifetime).',                60, 16, False),
    ('ACH_CHESTS_250',     'Treasure Hunter',       'Open 250 chests (lifetime).',                    35, 17, False),
    ('ACH_CLEAR_PINES',    'Pines Patrol',          'Clear Pepperoni Pines.',                         20, 18, False),
    ('ACH_CLEAR_SLOPES',   'Slope Style',           'Clear Sundried Slopes.',                         35, 19, False),
    ('ACH_CLEAR_GLACIER',  'Cold Cuts',             'Clear Frostbite Glacier.',                       45, 20, False),
    ('ACH_NEW_HIRE',       'New Hire',              'Unlock a second character.',                     20, 21, False),
    ('ACH_FULL_ROSTER',    'Full Roster',           'Unlock every character.',                        45, 22, False),
    ('ACH_SIGNATURE',      'Signature Dish',        'Unlock a character-signature item.',             45, 23, False),
    ('ACH_SLICE_BARON',    'Slice Baron',           'Earn 500 slices (lifetime).',                    35, 24, False),
    ('ACH_OVERACHIEVER',   'Overachiever',          'Complete a challenge.',                          20, 25, False),
    ('ACH_UNTOUCHABLE',    'Untouchable',           'Win a run without taking a single hit.',         60, 26, True),
    ('ACH_SPEED_DEMON',    'Speed Demon',           'Melt the Warlord within ~60s of it appearing.',  45, 27, True),
]

def assert_no_commas():
    for key, name, desc, *_ in ACH:
        assert ',' not in name, f'comma in name: {name}'
        assert ',' not in desc, f'comma in desc: {desc}'

def main():
    assert_no_commas()
    if os.path.isdir(STAGE):
        shutil.rmtree(STAGE)
    os.makedirs(STAGE, exist_ok=True)

    # 1) Metadata — Name, Description, Incremental(False), Steps(blank), InitialState, Points, ListOrder.
    # The Name + Description here ARE the default-locale (en-US) display text. We do
    # NOT ship an AchievementsLocalizations.csv: that file is only for locales OTHER
    # than the game's default, so an en-US row there errors ("Wrong locale").
    with open(os.path.join(STAGE, 'AchievementsMetadata.csv'), 'w', newline='', encoding='utf-8') as f:
        w = csv.writer(f)
        for key, name, desc, pts, order, hidden in ACH:
            w.writerow([name, desc, 'False', '', 'Hidden' if hidden else 'Revealed', pts, order])

    # 2) Icon mappings — Name, iconFilename  (+ copy each icon into the stage)
    with open(os.path.join(STAGE, 'AchievementsIconsMappings.csv'), 'w', newline='', encoding='utf-8') as f:
        w = csv.writer(f)
        for key, name, desc, pts, order, hidden in ACH:
            icon = key + '.png'
            src = os.path.join(ICON_SRC, icon)
            if not os.path.isfile(src):
                raise SystemExit(f'missing icon: {src} (run: PGS=1 node scripts/gen-achievement-icons.mjs)')
            shutil.copy2(src, os.path.join(STAGE, icon))
            w.writerow([name, icon])

    # 4) Zip it flat
    zip_path = os.path.join(OUT_DIR, 'achievements-import.zip')
    with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as z:
        for fn in sorted(os.listdir(STAGE)):
            z.write(os.path.join(STAGE, fn), fn)
    shutil.rmtree(STAGE)

    size_kb = os.path.getsize(zip_path) / 1024
    print(f'Wrote {zip_path} ({len(ACH)} achievements, {size_kb:.0f} KB)')

if __name__ == '__main__':
    main()
