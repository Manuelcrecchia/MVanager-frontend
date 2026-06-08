import { Component } from '@angular/core';
import { GlobalService } from '../../../service/global.service';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Router } from '@angular/router';
import { PopupServiceService } from '../../popup/popup-service.service';

@Component({
  selector: 'app-cambiapassword',
  templateUrl: './cambiapassword.component.html',
  styleUrl: './cambiapassword.component.css'
})
export class CambiapasswordComponent {
  constructor(private globalService: GlobalService, private http: HttpClient, private router: Router, private popup: PopupServiceService) { }

changePassword(password: string){
  const body = {email: this.globalService.email, password: password};
        this.http.post(this.globalService.url + "admin/resetPassword", body, {headers: this.globalService.headers, responseType: 'text'}).subscribe(response => {
            this.router.navigateByUrl('/loginPrivateArea');
        })
}


  back(){
    this.router.navigateByUrl('/homeAdmin');
  }
}
