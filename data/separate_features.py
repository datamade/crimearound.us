import json

def save_feats(feats):
    features = feats['features']
    for feature in features:
        feat = feature['geometry']
        feat['properties'] = feature['properties']
        name = str(feat['properties']['AREA_NUMBE']).zfill(2)
        yield name, feat

if __name__ == "__main__":
    import sys
    import os
    try:
        os.makedirs('community_areas')
    except:
        pass
    fname = sys.argv[1]
    feats = json.load(open(fname, 'rb'))
    for name, feat in save_feats(feats):
        print name
        outp = open('community_areas/%s.geojson' % name, 'wb')
        outp.write(json.dumps(feat))
