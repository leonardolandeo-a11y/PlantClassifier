import { afterEach, expect, it, vi } from 'vitest';
import { HttpClient } from '../src/api/httpClient';
import { ControlRejected } from '../src/movement/controller';
afterEach(()=>vi.unstubAllGlobals());
const csrf = () => new Response(JSON.stringify({headerName:'X-CSRF-TOKEN',token:'test'}));
it('shares CSRF bootstrap, sends cookies and marks priority STOP keepalive',async()=>{
 const fetcher=vi.fn(async(url:string)=>url==='/csrf'?csrf():new Response('{}'));vi.stubGlobal('fetch',fetcher);
 const client=new HttpClient();await Promise.all([client.request('/sensors/capture',{mutation:true}),client.request('/movement',{mutation:true,body:{command:'STOP'}})]);
 expect(fetcher.mock.calls.filter(([url])=>url==='/csrf')).toHaveLength(1);
 const calls=fetcher.mock.calls as unknown as [string,RequestInit][];
 const options=calls.find(([url])=>url==='/movement')![1];expect(options.keepalive).toBe(true);expect(options.credentials).toBe('same-origin');expect(options.headers).toEqual({'X-CSRF-TOKEN':'test','Content-Type':'application/json'});
});
it.each([[403,'Session protection'],[409,'Command rejected'],[502,'Device unreachable'],[504,'Device timed out'],[500,'Request failed']])('HTTP %s remains an error',async(status,message)=>{
 vi.stubGlobal('fetch',vi.fn(async()=>new Response('{}',{status:status as number})));
 const result=new HttpClient().request('/sensors');await expect(result).rejects.toThrow(message as string);if(status===409)await expect(result).rejects.toBeInstanceOf(ControlRejected);
});
it('aborted capture never starts after pending CSRF bootstrap',async()=>{
 let resolve!: (response:Response)=>void;const pending=new Promise<Response>(r=>{resolve=r;});const fetcher=vi.fn(()=>pending);vi.stubGlobal('fetch',fetcher);
 const controller=new AbortController();const request=new HttpClient().request('/sensors/capture',{mutation:true,signal:controller.signal});controller.abort();resolve(csrf());
 await expect(request).rejects.toThrow();expect(fetcher).toHaveBeenCalledTimes(1);
});
it('204 means no saved reading',async()=>{vi.stubGlobal('fetch',vi.fn(async()=>new Response(null,{status:204})));expect(await new HttpClient().request('/sensors')).toBeNull();});
it('capture deferred is explained as intentional and not as device failure', async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({type:'urn:plantclassifier:capture-deferred'}),{status:409})));
 await expect(new HttpClient().request('/sensors/capture')).rejects.toThrow('Suelta el servo');
});
