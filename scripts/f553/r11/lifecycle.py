"""Disposable-only storage-backed lifecycle used by the R11.2 GitHub proof."""
from __future__ import annotations
import gzip, hashlib, json, os, tempfile, time
from pathlib import Path
from urllib.parse import quote, urlsplit
from uuid import uuid4

RAW_BUCKET = 'cs2-raw-evidence'
SECTIONS = ('header','players','rounds','events','ticks','grenades','player-info','game-state','economy','forensic')

def stable(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False,
                      allow_nan=False, default=str).encode()

def sha(value): return hashlib.sha256(value).hexdigest()
def lit(value): return "'" + str(value).replace("'", "''") + "'"
def jsonb(value): return lit(stable(value).decode()) + '::jsonb'

def require_local(api_url):
    p=urlsplit(api_url)
    if p.scheme != 'http' or p.hostname not in ('localhost','127.0.0.1') or p.port != 54321:
        raise RuntimeError('Refusing non-disposable Storage endpoint')

def ensure_bucket(api_url, key, request, bucket, limit):
    require_local(api_url); endpoint=f'/storage/v1/bucket/{bucket}'
    created=False
    try: _, body=request(api_url,key,endpoint)
    except RuntimeError as exc:
        text=str(exc)
        if not (text.startswith(('local HTTP 400 GET ','local HTTP 404 GET ')) and '"code":"NoSuchBucket"' in text): raise
        request(api_url,key,'/storage/v1/bucket','POST',stable({'id':bucket,'name':bucket,'public':False,'file_size_limit':limit}),'application/json')
        created=True; _,body=request(api_url,key,endpoint)
    state=json.loads(body)
    if state.get('id') != bucket or state.get('public') is not False or state.get('file_size_limit') != limit:
        raise RuntimeError(f'Disposable bucket configuration invalid: {bucket}')
    return {'bucket':bucket,'private':True,'file_size_limit':limit,'created':created}

def storage_get(api_url,key,request,bucket,path):
    status,body=request(api_url,key,f'/storage/v1/object/{bucket}/{quote(path)}')
    if status != 200: raise RuntimeError('Storage read did not return 200')
    return body

def storage_put(api_url,key,request,bucket,path,body,content_type='application/octet-stream'):
    status,_=request(api_url,key,f'/storage/v1/object/{bucket}/{quote(path)}','POST',body,content_type)
    if status not in (200,201): raise RuntimeError('Storage write was not accepted')
    read=storage_get(api_url,key,request,bucket,path)
    if read != body: raise RuntimeError('Storage read-back differs from written bytes')
    return {'path':path,'bytes':len(body),'sha256':sha(body),'write_status':status,'read_status':200}

def parser_sections(parsed):
    evidence=parsed.get('raw_evidence') or {}
    return {
      'header':[evidence.get('manifest',{}).get('raw_header') or parsed.get('header') or {}],
      'players':evidence.get('raw_player_info') or parsed.get('players') or [],
      'rounds':evidence.get('round_evidence') or parsed.get('rounds') or [],
      'events':evidence.get('raw_events') or parsed.get('events') or [],
      'ticks':evidence.get('tick_samples') or [], 'grenades':evidence.get('grenade_samples') or [],
      'player-info':evidence.get('player_coverage') or [],
      'game-state':(evidence.get('tick_coverage') or [])+(evidence.get('grenade_coverage') or []),
      'economy':evidence.get('economy_coverage') or [],
      'forensic':[{'forensic_contract_v2':evidence.get('forensic_contract_v2'),
                   'gates':evidence.get('gates') or [], 'raw_status':evidence.get('raw_status'),
                   'raw_audit_status':evidence.get('raw_audit_status'),
                   'raw_block_reasons':evidence.get('raw_block_reasons') or []}],
    }

def persist_raw(db,sql,api_url,key,request,claim,parsed,parser_meta):
    ensure_bucket(api_url,key,request,RAW_BUCKET,104857600)
    artifact_id=str(uuid4()); prefix=f"{claim['user_id']}/{claim['upload_id']}/attempt-{claim['attempt_number']}"
    manifest_path=f'{prefix}/manifest.json'
    sql(db,"INSERT INTO public.raw_evidence_artifacts(id,job_id,upload_id,user_id,attempt_number,demo_sha256,storage_bucket,storage_prefix,manifest_storage_path,schema_version,status,raw_status,audit_status) VALUES ("+
        ','.join(map(lit,[artifact_id,claim['job_id'],claim['upload_id'],claim['user_id']]))+f",{int(claim['attempt_number'])},{lit(claim['demo_sha256'])},{lit(RAW_BUCKET)},{lit(prefix)},{lit(manifest_path)},1,'uploading','writing','running');")
    chunks=[]; previous=None; global_index=0
    for section in SECTIONS:
        rows=parser_sections(parsed)[section]
        if not rows: continue
        # Bounded chunks are real gzip JSONL derived from parser output.
        pending=[]; size=0; section_index=0; first=0
        batches=[]
        for index,row in enumerate(rows):
            encoded=stable(row)+b'\n'; pending.append(encoded); size += len(encoded)
            if size >= 4*1024*1024:
                batches.append((first,pending)); first=index+1; pending=[]; size=0
        if pending: batches.append((first,pending))
        for first_row,lines in batches:
            body=gzip.compress(b''.join(lines),mtime=0); digest=sha(body)
            path=f'{prefix}/{section}/chunk-{section_index:06d}.jsonl.gz'
            stored=storage_put(api_url,key,request,RAW_BUCKET,path,body,'application/gzip')
            last=first_row+len(lines)-1
            sql(db,"INSERT INTO public.raw_evidence_chunks(artifact_id,section,chunk_index,storage_path,first_row,last_row,row_count,byte_size,sha256,previous_chunk_sha256,status,uploaded_at,verified_at) VALUES ("+
                f"{lit(artifact_id)},{lit(section)},{section_index},{lit(path)},{first_row},{last},{len(lines)},{len(body)},{lit(digest)},{'NULL' if previous is None else lit(previous)},'verified',now(),now());")
            chunks.append({'section':section,'chunk_index':section_index,'storage_path':path,'first_row':first_row,'last_row':last,'row_count':len(lines),'byte_size':len(body),'sha256':digest,'previous_chunk_sha256':previous,'storage_sha256':stored['sha256']})
            previous=digest; section_index+=1; global_index+=1
    summaries=[]
    for section in SECTIONS:
        own=[c for c in chunks if c['section']==section]
        summaries.append({'name':section,'chunk_count':len(own),'row_count':sum(c['row_count'] for c in own),'byte_count':sum(c['byte_size'] for c in own),'digest':sha(stable([c['sha256'] for c in own]))})
    root=sha(stable(summaries)); audit={'parser_output_digest':parser_meta['parser_output_digest'],'chunk_chain_tail':previous,'sections':summaries}
    manifest={'schema_version':1,'demo_sha256':claim['demo_sha256'],'upload_id':claim['upload_id'],'job_id':claim['job_id'],'attempt_number':claim['attempt_number'],'parser':{'name':'demoparser2','version':parser_meta['parser_version'],'revision':os.environ['GITHUB_SHA']},'contract_version':1,'sections':summaries,'root_digest':root,'status':'ready','raw_status':'ready','audit_status':'approved','audit_evidence':audit,'audit_evidence_digest':sha(stable(audit))}
    manifest_bytes=stable(manifest); manifest_store=storage_put(api_url,key,request,RAW_BUCKET,manifest_path,manifest_bytes,'application/json')
    totals={'total_chunks':len(chunks),'total_rows':sum(c['row_count'] for c in chunks),'total_bytes':sum(c['byte_size'] for c in chunks)}
    sql(db,"UPDATE public.raw_evidence_artifacts SET status='ready',raw_status='ready',audit_status='approved',root_digest="+lit(root)+f",total_chunks={totals['total_chunks']},total_rows={totals['total_rows']},total_bytes={totals['total_bytes']},ready_at=now(),updated_at=now() WHERE id={lit(artifact_id)};")
    return {'raw_artifact_id':artifact_id,'storage_bucket':RAW_BUCKET,'storage_prefix':prefix,'manifest_storage_path':manifest_path,'manifest_sha256':manifest_store['sha256'],'root_digest':root,**totals,'chunks':chunks,'manifest':manifest}

def persist_hot_and_finish(db,sql,claim,parsed,parser_meta,raw):
    # HOT is a bounded semantic projection derived only after RAW read-back and commit.
    hot={'schema_version':1,'job_id':claim['job_id'],'upload_id':claim['upload_id'],'attempt_number':claim['attempt_number'],'raw_artifact_id':raw['raw_artifact_id'],'raw_sha256':raw['root_digest'],'parser_execution_id':parser_meta['parser_execution_id'],'parser_version':parser_meta['parser_version'],'players':len(parsed.get('players') or []),'rounds':len(parsed.get('rounds') or []),'events':len(parsed.get('events') or [])}
    hot['hot_digest']=sha(stable(hot)); match_id=str(uuid4()); source_id=str(uuid4())
    sql(db,"INSERT INTO public.matches(id,upload_id,platform,map,rounds,round_count,canonical_status,finished,terminal,canonical_schema_version,quality,demo_metadata,content_fingerprint,canonical_source,round_source) VALUES ("+
        f"{lit(match_id)},{lit(claim['upload_id'])},'demo',{lit(str((parsed.get('header') or {}).get('map_name') or 'unknown'))},{hot['rounds']},{hot['rounds']},'completed',true,true,2,{jsonb({'r11_disposable':True})},{jsonb(hot)},{lit(hot['hot_digest'])},'demo','demo');")
    sql(db,"INSERT INTO public.match_sources(id,match_id,source,source_contract_version,source_version,fetched_at,status,quality,fingerprint,upload_id,metadata) VALUES ("+
        f"{lit(source_id)},{lit(match_id)},'demo','1',{lit(parser_meta['parser_version'])},now(),'complete',{jsonb({'raw_verified':True})},{lit(hot['hot_digest'])},{lit(claim['upload_id'])},{jsonb(hot)});")
    result={'match_id':match_id,'finished_at':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'duration_ms':1,'parser_name':'demoparser2','parser_version':parser_meta['parser_version'],'parser_revision':os.environ['GITHUB_SHA'],'schema_version':1,'analysis_version':'r11.2-v12','rounds_detected':hot['rounds'],'rounds_valid':hot['rounds'],'players_detected':hot['players'],'events_detected':hot['events'],'extraction_confidence':1,'partial_parse':False,'quality_flags':[]}
    finished=sql(db,f"SELECT public.finish_demo_job_processed({lit(claim['job_id'])}::uuid,{jsonb(result)});")
    if finished != 't': raise RuntimeError('FINISHED transition rejected')
    state=sql(db,f"SELECT status||'|'||match_id::text FROM public.demo_jobs WHERE id={lit(claim['job_id'])};")
    if state != f"processed|{match_id}": raise RuntimeError('FINISHED state identity mismatch')
    return {'match_id':match_id,'match_source_id':source_id,'hot':hot,'hot_digest':hot['hot_digest'],'finished':True,'terminal_state':'processed'}
