import urllib.request, json, time

BASE='http://localhost:3000'
USER='u'+str(int(time.time()))[-7:]
def req(method, path, data=None, headers=None, token=None):
    url=BASE+path
    h=headers or {}
    if token: h['Authorization']='Bearer '+token
    body=json.dumps(data).encode() if isinstance(data,dict) else (data or b'')
    if isinstance(data,dict): h['Content-Type']='application/json'
    r=urllib.request.Request(url, data=body if body else None, headers=h, method=method)
    try:
        resp=urllib.request.urlopen(r, timeout=10)
        return resp.status, resp.read().decode('utf-8','replace')
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode('utf-8','replace')

# health
print('HEALTH', req('GET','/api/health')[0])
# register
st,body=req('POST','/api/register',{'username':USER,'password':'1234'})
print('REGISTER', st)
reg=json.loads(body)
tok=reg['token']
print('  sharedData keys:', list(reg.get('sharedData',{}).keys()))
print('  inviteCode:', reg.get('inviteCode'))
# upload media (raw stream)
hdr={'Content-Type':'image/jpeg'}
st,body=req('POST','/api/media?name=test.jpg', data=b'hello-media-bytes', headers=hdr, token=tok)
print('UPLOAD', st, body)
url=json.loads(body)['url'] if st==200 else ''
# fetch media
if url:
    st2,data=req('GET',url)
    print('GET MEDIA', st2, 'size', len(data))
else:
    print('GET MEDIA skipped')
# push shared (fridge) and read back
sd=reg['sharedData']
sd['fridge']={'cold':{'水果':[{'id':'i1','name':'苹果','qty':3,'unit':'个','expire':'','icon':'🍎'}]},'freeze':{}}
st,body=req('POST','/api/share/'+reg['inviteCode'], {'data':sd}, token=tok)
print('PUSH SHARED', st)
st,body=req('GET','/api/share/'+reg['inviteCode'], token=tok)
print('PULL SHARED', st, '| fridge cold 水果:', json.loads(body)['data']['fridge']['cold'])
