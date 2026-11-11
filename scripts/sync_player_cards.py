#!/usr/bin/env python3
"""Partidos terminados y tarjetas por jugador de ESPN. Datos personales NO incluidos.
Uso personal informativo. Evita inventar convocatorias o tarjetas.
"""
import datetime as dt
import json
import time
import urllib.request
from pathlib import Path

ROOT = 'https://site.api.espn.com/apis/site/v2/sports/soccer/'
LEAGUES = {
    'laliga': 'esp.1',
    'hypermotion': 'esp.2',
    'premier': 'eng.1',
    'champions': 'uefa.champions',
    'copadelrey': 'esp.copa_del_rey',
    'supercopa': 'esp.super_cup',
    'nations': 'uefa.nations',
}
NOW = dt.datetime.now(dt.timezone.utc)
CUTOFF = (NOW - dt.timedelta(days=95)).strftime('%Y-%m-%d')
DEST = Path('feeds/player_cards.json')
MAX_PER_LEAGUE = 90
MAX_GLOBAL = 600


def request_json(url, timeout=14):
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json'})
    with urllib.request.urlopen(req, timeout=timeout) as response:
        return json.load(response)


def get_month(offset):
    n = NOW.year * 12 + NOW.month - 1 + offset
    return f'{n // 12:04d}{n % 12 + 1:02d}'


def card_stat(stats, name):
    for x in stats or []:
        if x.get('name') == name and x.get('value') is not None:
            try:
                return float(x['value'])
            except (TypeError, ValueError):
                return None
    return None


def extract_roster_summary(payload, event, league):
    teams = payload.get('rosters') or []
    players = []
    for side in teams:
        team = (side.get('team') or {}).get('displayName', '')
        team_id = (side.get('team') or {}).get('id')
        if not team or not team_id:
            continue
        for p in side.get('roster') or []:
            athlete = p.get('athlete') or {}
            yellow = card_stat(p.get('stats'), 'yellowCards')
            appearance = card_stat(p.get('stats'), 'appearances')
            if yellow is None or appearance is None or appearance <= 0:
                continue
            player_id = athlete.get('id')
            name = athlete.get('displayName')
            if not player_id or not name or yellow < 0 or yellow > 2:
                continue
            players.append({
                'id': str(player_id),
                'name': str(name),
                'team': str(team),
                'teamId': str(team_id),
                'appearance': True,
                'yellow': int(yellow),
            })
    if len(teams) < 2 or len(players) < 15:
        return None
    return {
        'id': str(event['id']),
        'league': league,
        'date': event['date'][:10],
        'players': players,
    }


def main():
    data = {'fetchedAt': NOW.isoformat(), 'matches': []}
    if DEST.exists():
        try:
            old = json.loads(DEST.read_text(encoding='utf-8'))
            if isinstance(old.get('matches'), list):
                data['matches'] = [x for x in old['matches'] if x.get('date', '') >= CUTOFF]
        except Exception as error:
            print('Historic file unreadable:', error)
    records = {(m.get('league'), str(m.get('id'))): m for m in data['matches']}
    counts = {}
    for league, espn_slug in LEAGUES.items():
        candidates = {}
        for month in [get_month(x) for x in range(-3, 1)]:
            url = f'{ROOT}{espn_slug}/scoreboard?dates={month}&limit=500'
            try:
                response = request_json(url)
                for e in response.get('events', []):
                    date = (e.get('date') or '')[:10]
                    if (
                        e.get('id')
                        and date >= CUTOFF
                        and date <= NOW.date().isoformat()
                        and (e.get('status') or {}).get('type', {}).get('state') == 'post'
                    ):
                        candidates[str(e['id'])] = e
            except Exception as error:
                print('Scoreboard unavailable:', league, month, str(error))
        downloaded = 0
        for e in sorted(candidates.values(), key=lambda x: x.get('date', ''), reverse=True)[:MAX_PER_LEAGUE]:
            key = (league, str(e['id']))
            if key in records:
                continue
            try:
                summary = request_json(f'{ROOT}{espn_slug}/summary?event={e["id"]}')
                item = extract_roster_summary(summary, e, league)
                if item:
                    records[key] = item
                    downloaded += 1
                else:
                    print('Player cards unavailable for', league, e['id'])
            except Exception as error:
                print('Summary unavailable:', league, e['id'], str(error))
            time.sleep(0.09)
        counts[league] = {
            'availableMatches': sum(1 for k in records if k[0] == league),
            'newMatches': downloaded,
        }
        print(league, counts[league])
    output = sorted(records.values(), key=lambda m: m['date'], reverse=True)[:MAX_GLOBAL]
    if output:
        DEST.parent.mkdir(parents=True, exist_ok=True)
        data = {'fetchedAt': NOW.isoformat(), 'matches': output, 'coverage': counts,
                'source': 'ESPN public match summaries, verified appearances and yellow cards',
                'note': 'No confirmed future lineups. Historical booking frequency only; experimental probabilities.'}
        DEST.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
        print('Saved', len(output), 'games with verified player bookings.')
    else:
        print('No verified player data available; do not create any placeholder records.')


if __name__ == '__main__':
    main()
