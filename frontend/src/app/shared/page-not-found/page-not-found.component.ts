import { Component } from '@angular/core';
import { HOME_URL } from '../../core/config/app-paths';

@Component({
  selector: 'app-page-not-found',
  templateUrl: './page-not-found.component.html',
  styleUrl: './page-not-found.component.scss'
})
export class PageNotFoundComponent {

  /** Where "Go to home" should lead. */
  readonly homeUrl = HOME_URL;

}