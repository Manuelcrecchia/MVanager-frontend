import { of } from 'rxjs';
import { InternalWarehouseComponent } from '../admin/internal-warehouse/internal-warehouse.component';
import { CustomerWarehouseComponent } from '../admin/customer-warehouse/customer-warehouse.component';
import { GestioneTagClienteComponent } from '../gestione-tag-cliente/gestione-tag-cliente.component';

describe('private image compatibility with older metadata', () => {
  it('maps an old product photo URL to its authenticated resource ID', () => {
    const component: any = Object.create(InternalWarehouseComponent.prototype);
    component.global = { url: 'https://images.test/' };
    const url = new URL(component.productImageUrl({ id: 7, photoUrl: '/uploads/internal-warehouse/tenant-a/old.jpg' }));
    expect(url.pathname).toBe('/private-images/admin/products/7');
    expect(url.searchParams.has('token')).toBeFalse();
  });
  it('maps an old tag URL to the customer ID without requesting the static URL', () => {
    const component: any = Object.create(GestioneTagClienteComponent.prototype);
    component.numeroCliente = 'C-42';
    component.globalService = { url: 'https://images.test/' };
    component.http = { post: () => of({ immagine: 'uploads/tag/old.jpg' }) };
    component.getData();
    expect(new URL(component.immagineAttuale).pathname).toBe('/private-images/admin/tags/C-42');
  });
  it('warehouse photo previews use the internal viewer instead of opening a private URL externally', () => {
    const component: any = Object.create(CustomerWarehouseComponent.prototype);
    component.global = { url: 'https://images.test/' };
    const source = of(new Blob(['fixture'], { type: 'image/png' }));
    component.images = { fetch: jasmine.createSpy('fetch').and.returnValue(source) };
    component.attachmentViewer = { open: jasmine.createSpy('open') };
    component.openPhoto({ id: 9, fileName: 'foto.png', filePath: '/uploads/customer-warehouse/tenant-a/old.png' });
    expect(component.images.fetch).toHaveBeenCalledWith('https://images.test/private-images/admin/customer-warehouse/9');
    expect(component.attachmentViewer.open).toHaveBeenCalledWith({ originalName: 'foto.png' }, source);
  });
});
