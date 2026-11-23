import {EntityNumberCatalog,compareBusinessNumbers,invoiceNumber} from './entity-number-catalog';
export function numberingServiceStub() {
  const catalog=new EntityNumberCatalog();
  return {customerNumber:(value:any)=>catalog.format('customer',value,'qa'),quoteNumber:(value:any)=>catalog.format('quote',value,'qa'),compareBusinessNumbers,invoiceNumber,observeEntityNumbers:(body:any)=>catalog.observe(body,'qa')};
}
