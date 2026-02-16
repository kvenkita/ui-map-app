import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';

import { RouterOutlet } from '@angular/router';
import { MapComponent } from "./map/map.component";
import { ToolbarComponent } from './toolbar/toolbar.component';

import { projectConfig } from './projectConfig';

import { MapService } from './services/map.service';
import { MapCategory } from './shared/models/map-category';
import { TimeSliderComponent } from "./time-slider/time-slider.component";

import { MatSidenavModule } from '@angular/material/sidenav';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { SearchComponent } from "./search/search.component";
import { BivariateComponent } from "./analysis/bivariate/bivariate.component";
import { AutocorrelationComponent } from "./analysis/autocorrelation/autocorrelation.component";

@Component({
  selector: 'app-root',
  imports: [MapComponent, ToolbarComponent, TimeSliderComponent, TimeSliderComponent, MatSidenavModule, MatTooltipModule, MatIconModule, MatButtonModule, SearchComponent, BivariateComponent, AutocorrelationComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent implements OnInit {
  constructor(private mapService: MapService) { }

  async initializeApp() {
    await this.setProject(projectConfig.projectId);
  }

  title = 'angular-app';
  projectName = '';
  projectId?:number;

  isSidenavOpen?:boolean;


  setProject(id: number): void {
    this.mapService.getProjectById(id)
      .subscribe(project => {
        this.mapService.project = project;
        this.projectName = project.name;
        this.projectId = project.projectId
      });
  }

  ngOnInit() {
    this.initializeApp().then(r => {
      return r;
    });

    this.mapService.getSidenavOpen().subscribe((state) => {
      this.isSidenavOpen = state;
    })
  }

  toggleSidenav() {
    this.isSidenavOpen = !this.isSidenavOpen;
    this.mapService.setSidenavOpen(this.isSidenavOpen);
  }
}

