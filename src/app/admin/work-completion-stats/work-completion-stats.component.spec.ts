import {of,Subject} from 'rxjs';
import {WorkCompletionStatsComponent} from './work-completion-stats.component';
describe('Quality statistics permissions and filters',()=>{
  function fixture(access={feedback:true,quality:true}){
    const http={get:jasmine.createSpy('get').and.callFake((url:string)=>of(url.endsWith('/access')?access:{summary:{},rows:[],totalFiltered:0,pageSize:25}))};
    const result=new WorkCompletionStatsComponent(http as any,{} as any,{url:'/',hasPermission:()=>false} as any,{} as any);result.ngOnInit();return {result,http};
  }
  it('loads only the internal section when that is the only statistics permission',()=>{
    const {result,http}=fixture({feedback:false,quality:true});expect(result.kind).toBe('quality');expect(http.get.calls.mostRecent().args[1].params.get('kind')).toBe('quality');const count=http.get.calls.count();result.switchKind('feedback');expect(http.get.calls.count()).toBe(count);
  });
  it('does not load either dataset with only access to the statistics page',()=>{
    const {http}=fixture({feedback:false,quality:false});expect(http.get.calls.count()).toBe(1);
  });
  it('keeps type, status and date basis explicit and resets pagination on a filter change',()=>{
    const {result,http}=fixture();result.page=3;result.mode='recurring';result.status='overdue';result.dateBasis='completion';result.loadStats();const params=http.get.calls.mostRecent().args[1].params;expect(params.get('mode')).toBe('recurring');expect(params.get('status')).toBe('overdue');expect(params.get('dateBasis')).toBe('completion');expect(params.get('page')).toBe('0');expect(result.dateFormat('2026-11-03')).toBe('dd/MM/yyyy');expect(result.dateFormat('2026-11-03T10:00:00Z')).toBe('dd/MM/yyyy HH:mm');
  });
  it('ignores a slow response from a previously selected dataset',()=>{
    const {result,http}=fixture(),first=new Subject<any>(),second=new Subject<any>();http.get.and.returnValues(first,second);result.loadStats();result.switchKind('quality');second.next({kind:'quality'});first.next({kind:'feedback'});expect(result.stats.kind).toBe('quality');
  });
});
