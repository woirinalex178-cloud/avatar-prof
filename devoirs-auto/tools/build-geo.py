"""Fabrique les fonds de carte de l'app (geo/*.json) à partir de données libres :
  - France : github.com/gregoiredavid/france-geojson (régions, départements, données IGN / Etalab)
  - Monde, fleuves, reliefs, mers : Natural Earth (domaine public), github.com/nvkelso/natural-earth-vector
Usage : python3 build-geo.py <dossier des téléchargements> <dossier de sortie>
"""
import json, sys, math

SRC, OUT = sys.argv[1], sys.argv[2]
load = lambda f: json.load(open(f'{SRC}/{f}', encoding='utf-8'))['features']

def dp(pts, tol):  # Douglas-Peucker
    if len(pts) < 3 or tol <= 0: return pts
    a, b = pts[0], pts[-1]
    dx, dy = b[0] - a[0], b[1] - a[1]; n = math.hypot(dx, dy)
    d = (lambda p: abs(dy * (p[0] - a[0]) - dx * (p[1] - a[1])) / n) if n else (lambda p: math.hypot(p[0] - a[0], p[1] - a[1]))  # anneau fermé
    i, m = max(((i, d(p)) for i, p in enumerate(pts[1:-1], 1)), key=lambda t: t[1])
    return dp(pts[:i + 1], tol)[:-1] + dp(pts[i:], tol) if m > tol else [a, b]

def geom(g, tol, nd):
    r = lambda ring: [[round(x, nd), round(y, nd)] for x, y in dp([p[:2] for p in ring], tol)]
    t, c = g['type'], g['coordinates']
    if t == 'Polygon': c = [r(x) for x in c if len(r(x)) > 3]
    elif t == 'MultiPolygon': c = [[r(x) for x in p if len(r(x)) > 3] for p in c]; c = [p for p in c if p]
    elif t == 'LineString': c = r(c)
    elif t == 'MultiLineString': c = [r(x) for x in c]
    return {'type': t, 'coordinates': c}

def inbox(g, box):
    x0, y0, x1, y1 = box
    def pts(c): return [] if not c else [c] if isinstance(c[0], (int, float)) else [p for s in c for p in pts(s)]
    return any(x0 <= x <= x1 and y0 <= y <= y1 for x, y in (p[:2] for p in pts(g['coordinates'])))

def save(name, feats):
    json.dump({'type': 'FeatureCollection', 'features': feats}, open(f'{OUT}/{name}.json', 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))

F = lambda props, g: {'type': 'Feature', 'properties': props, 'geometry': g}
EUR = (-25, 34, 45, 72)

save('fr-regions', [F({'nom': f['properties']['nom']}, geom(f['geometry'], .01, 3)) for f in load('fgj/regions-version-simplifiee.geojson')])
save('fr-departements', [F({'nom': f['properties']['nom'], 'code': f['properties']['code']}, geom(f['geometry'], .008, 3)) for f in load('fgj/dep.geojson')])
pays = lambda f: {'nom': f['properties'].get('NAME_FR') or f['properties']['NAME'], 'continent': f['properties'].get('CONTINENT'),
                  'lx': f['properties'].get('LABEL_X'), 'ly': f['properties'].get('LABEL_Y')}
save('monde', [F(pays(f), geom(f['geometry'], .2, 2)) for f in load('ne_110m_admin_0_countries.geojson')])
save('europe', [F(pays(f), geom(f['geometry'], .03, 2)) for f in load('ne_50m_admin_0_countries.geojson') if inbox(f['geometry'], EUR)])

FR = {'Rhine': 'Rhin', 'Rhone': 'Rhône', 'Saone': 'Saône', 'Thames': 'Tamise', 'Tagus': 'Tage', 'Tajo': 'Tage', 'Ebro': 'Èbre',
      'Vistula': 'Vistule', 'Dnieper': 'Dniepr', 'Dniester': 'Dniestr', 'Douro': 'Douro', 'Guadalquivir': 'Guadalquivir', 'Scheldt': 'Escaut', 'Meuse': 'Meuse'}
riv = {}
for f in load('ne_10m_rivers_lake_centerlines.geojson') + load('ne_10m_rivers_europe.geojson'):
    n = f['properties'].get('name'); g = f['geometry']
    if not n or not g or not inbox(g, EUR): continue
    n = FR.get(n, n); lines = [g['coordinates']] if g['type'] == 'LineString' else g['coordinates']
    riv.setdefault(n, []).extend(lines)
save('fleuves', [F({'nom': n}, geom({'type': 'MultiLineString', 'coordinates': c}, .01, 3)) for n, c in sorted(riv.items())])

KEEP = {'Range/mtn', 'Plateau', 'Plain', 'Lowland', 'Peninsula', 'Pen/cape', 'Island', 'Island group', 'Geoarea', 'Coast', 'Delta'}
save('reliefs', [F({'nom': f['properties'].get('NAME_FR') or f['properties']['NAME'], 'type': f['properties']['FEATURECLA']}, geom(f['geometry'], .02, 2))
                 for f in load('ne_10m_geography_regions_polys.geojson') if f['properties'].get('REGION') == 'Europe' and f['properties']['FEATURECLA'] in KEEP])
save('mers', [F({'nom': f['properties'].get('name_fr') or f['properties']['name']}, geom(f['geometry'], .05, 2))
              for f in load('ne_10m_geography_marine_polys.geojson') if f['geometry'] and inbox(f['geometry'], EUR)])
