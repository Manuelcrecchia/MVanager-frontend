import {EntityNumberCatalog,compareBusinessNumbers,invoiceNumber,businessDate} from './entity-number-catalog';
describe('numeri annuali visibili e identificativi interni',()=>{
 it('mantiene il numero disponibile dopo un riavvio offline e considera il fuso italiano',()=>{
  const values=new Map<string,string>(),storage={getItem:(key:string)=>values.get(key)||null,setItem:(key:string,value:string)=>{values.set(key,value);}};
  new EntityNumberCatalog(storage).observe({numeroCliente:'900',numeroClienteDisplay:'1/2027'},'sami');
  expect(new EntityNumberCatalog(storage).format('customer','900','sami')).toBe('1/2027');
  expect(new EntityNumberCatalog(storage).format('customer','900','emmeci')).toBe('900');
  expect(businessDate(new Date('2026-12-31T23:00:00Z'))).toBe('2027-01-01');
 });
 it('conserva gli ID e separa aziende, clienti e preventivi anche in cache',()=>{
  const catalog=new EntityNumberCatalog(),body={numeroCliente:'900',numeroClienteDisplay:'1/2027',numeroPreventivo:'900',numeroPreventivoDisplay:'120/2026'};
  catalog.observe(body,'sami');catalog.observe({customerId:'900',customerIdDisplay:'40/2026'},'emmeci');
  expect(catalog.format('customer','900','sami')).toBe('1/2027');expect(catalog.format('quote','900','sami')).toBe('120/2026');
  expect(catalog.format('customer','900','emmeci')).toBe('40/2026');expect(catalog.format('customer','900','other')).toBe('900');
  expect(body.numeroCliente).toBe('900');expect(catalog.format('customer','1/2027','sami')).toBe('1/2027');
 });
 it('ordina prima per anno e poi per progressivo e mantiene il numero fiscale originale',()=>{
  expect(compareBusinessNumbers('1/2027','900/2026')).toBeGreaterThan(0);expect(compareBusinessNumbers('10/2027','2/2027')).toBeGreaterThan(0);
  expect(invoiceNumber({number:'1',series:'A',year:2027,numberFormatVersion:1})).toBe('A/1/2027');
  expect(invoiceNumber({number:'2027',series:'A',year:2027,numberFormatVersion:1})).toBe('A/2027/2027');
  expect(invoiceNumber({number:'1',series:'A',year:2026,numberFormatVersion:0})).toBe('A/1');
 });
});
