import { Component } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { GlobalService } from '../service/global.service';

@Component({
  selector: 'app-gestione-tag-cliente',
  templateUrl: './gestione-tag-cliente.component.html',
  styleUrls: ['./gestione-tag-cliente.component.css'],
})
export class GestioneTagClienteComponent {
  numeroCliente: any;
  posizioneTag: string = '';
  immagineAttuale: string | null = null;
  nuovaImmagine: File | null = null;

  constructor(
    private route: ActivatedRoute,
    private http: HttpClient,
    public globalService: GlobalService
  ) {}

  ngOnInit() {
    this.numeroCliente = this.route.snapshot.paramMap.get('id');
    this.getData();
  }

  getData() {
    this.http
      .post(
        this.globalService.url + 'customers/getTagData',
        {
          numeroCliente: this.numeroCliente,
        },
        {
          headers: this.globalService.headers,
          responseType: 'json',
        }
      )
      .subscribe((res: any) => {
        this.posizioneTag = res.posizioneTag || '';
        if (res.immagine) {
          this.immagineAttuale = new URL(`private-images/admin/tags/${encodeURIComponent(this.numeroCliente)}?v=${encodeURIComponent(res.immagine)}`, this.globalService.url).toString();
        } else {
          this.immagineAttuale = null;
        }
      });
  }

  onFileSelected(event: any) {
    this.nuovaImmagine = event.target.files[0];
  }

  salva() {
    const formData = new FormData();
    formData.append('numeroCliente', this.numeroCliente);
    formData.append('posizioneTag', this.posizioneTag);

    if (this.nuovaImmagine) {
      formData.append('immagine', this.nuovaImmagine);
    }

    this.http
      .post(this.globalService.url + 'customers/updateTagData', formData, {
        responseType: 'text',
      })
      .subscribe(() => {
        alert('Dati salvati con successo!');
        this.nuovaImmagine = null;
        this.getData();
      });
  }
}
