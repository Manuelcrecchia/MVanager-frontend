import {EMPTY} from 'rxjs';
import {ShiftExportComponent} from './shift-export.component';
describe('Shift planning PDF export',()=>{
  function fixture(granted=true){const http={get:jasmine.createSpy('get').and.returnValue(EMPTY)},result=new ShiftExportComponent(http as any,{url:'/',hasPermission:()=>granted} as any);result.date=new Date(2026,10,24,12);return {result,http};}
  it('selects a whole Monday-to-Sunday week and handles month boundaries',()=>{
    const {result}=fixture();result.preset('week');expect(result.from).toBe('2026-11-23');expect(result.to).toBe('2026-11-29');result.date=new Date(2028,1,15,12);result.preset('month');expect(result.from).toBe('2028-02-01');expect(result.to).toBe('2028-02-29');
  });
  it('does not export without the specific permission',()=>{const {result,http}=fixture(false);result.preset('day');result.download();expect(http.get).not.toHaveBeenCalled();});
  it('requests a planning PDF without a publication filter and rejects inverted dates',()=>{
    const {result,http}=fixture();result.preset('day');result.download();const [url,options]=http.get.calls.mostRecent().args;expect(url).toBe('/shifts/export/pdf');expect(options.responseType).toBe('blob');expect(options.params.has('publication')).toBeFalse();
    const next=fixture();next.result.from='2026-11-30';next.result.to='2026-11-01';next.result.download();expect(next.http.get).not.toHaveBeenCalled();expect(next.result.error).toContain('intervallo');
  });
});
