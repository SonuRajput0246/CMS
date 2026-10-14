import { Component, inject, Inject } from '@angular/core';
import { INavigationaBar } from '../../../models/ICommon.model';
import { Router } from '@angular/router';

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss'
})
export class DashboardComponent {

	dashboardCards = [
	{
		title: 'Total Users',
		value: 128,
		route: '/cms/users',
		cssClass: 'users-card',
		icon: 'group'
	},
	{
		title: 'Inventory Items',
		value: 56,
		route: '/cms/inventory/list-inventory',
		cssClass: 'revenue-card',
		icon: 'inventory_2'
	},
	{
		title: 'Roles',
		value: 7,
		route: '/cms/roles',
		cssClass: 'expired-card',
		icon: 'admin_panel_settings'
	}
	];


	private _router = inject(Router)

	navData: INavigationaBar[] = [];

	ngOnInit(): void {
		this.initNavigation();
	}

	private initNavigation(): void {
		this.navData = [
			{ displayValue: 'Home', isClickable: false, isDashboard: false, redirectValue: '/cms/dashboard' }
		];
	}

	navigate(route: string): void {
		this._router.navigate([route]);
	}

}