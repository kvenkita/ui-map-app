import { Component, OnInit } from '@angular/core';
import {AsyncPipe,CommonModule} from '@angular/common';
import {FormControl, FormGroup, FormsModule, ReactiveFormsModule,Validators} from '@angular/forms';
import {Observable, Subscription} from 'rxjs';
import {map, startWith} from 'rxjs/operators';

import {MatAutocompleteModule} from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule }  from '@angular/material/card'
import { MatOptionSelectionChange } from '@angular/material/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatSlideToggleModule} from '@angular/material/slide-toggle';

import { MapService } from '../../services/map.service';
import { MapVariable } from '../../shared/models/map-variable';
import { MapMode } from '../../shared/enums/map-mode.enum';


import * as relationshipRendererCreator from "@arcgis/core/smartMapping/renderers/relationship.js";
import * as relationshipSchemes from "@arcgis/core/smartMapping/symbology/relationship.js";


@Component({
  selector: 'app-bivariate',
  imports: [CommonModule,MatButtonModule,MatCardModule,MatFormFieldModule,
    MatAutocompleteModule,AsyncPipe,MatInputModule,
    FormsModule,ReactiveFormsModule,MatSlideToggleModule],
  templateUrl: './bivariate.component.html',
  styleUrl: './bivariate.component.css'
})
export class BivariateComponent implements OnInit {

  private variableSubscription?:Subscription;
  private mapModeSubscription?:Subscription;

  constructor(private mapService: MapService) {}

  field1Control = new FormControl('',Validators.required);
  field1Filter?: Observable<MapVariable[]>;

  field2Control = new FormControl('',Validators.required);
  field2Filter?: Observable<MapVariable[]>;

  variables: MapVariable[] = [];

  field1Variable: MapVariable = this.variables[0];
  field2Variable: MapVariable = this.variables[1];
  checked: boolean = false;
  hideToggle: boolean = true;

  schemes = relationshipSchemes.getSchemes({
        basemap: "gray-vector",
        geometryType: "polygon"
      });

  // possible schemes - 9, 11, 14, 15, 17, 19, 20
  bivariateScheme = this.schemes!.secondarySchemes.filter((scheme) => scheme.name == 'Strawberry Tulips')[0];

  ngOnInit(): void {
    // console.log(this.mapService.featureLayer)

    this.variableSubscription = this.mapService.getMapCategories().subscribe((categories) => {
      
      console.log('CATEGORIES',categories);

      let variableArray = categories.flatMap((x) => x.mapVariables);
      
      this.mapService.getMapVariables(variableArray).subscribe((variables)=> {
        this.variables = variables.filter(v => v.disabled == false);
      })
      console.log('VARIABLES',this.variables)
    });

    this.field1Filter = this.field1Control.valueChanges.pipe(
          startWith(''),
          map(value => this._filter(value || '')),
        );

    this.field2Filter = this.field2Control.valueChanges.pipe(
      startWith(''),
      map(value => this._filter(value || '')),
    );

    this.mapModeSubscription = this.mapService.getMapMode().subscribe((mode)=> {
      if (mode == MapMode.bivariate) {
        this.checked = true;
      } else {
        this.checked = false;
      }
    });

    // console.log('SCHEMES',this.schemes);
  }

  private _filter(value: string): MapVariable[] {
      const filterValue = value.toLowerCase();
      // console.log(filterValue);
      return this.variables.filter(option => option.name.toString().toLowerCase().includes(filterValue));
    }

  onForm1Click(event:any) {
    this.field1Control.reset();
  }

  onForm2Click(event:any) {
    this.field2Control.reset();
  }

  onFieldChange(field: string, option:MapVariable) {
    const selectedVariable = option
    if (field == 'field1') {
      this.field1Variable = selectedVariable;
    } else if (field == 'field2') {
      this.field2Variable = selectedVariable;
    } 
  }

  onRunClick(event:any) {
    
    this.mapService.setMapMode(MapMode.bivariate);

    this.mapService.bivariateParams = {
      layer: this.mapService.variableFL,
      view: this.mapService.mapView,
      field1: {
        field: this.field1Variable.bivariateField,
        label: this.field1Variable.name
      },
      field2: {
        field: this.field2Variable.bivariateField,
        label: this.field2Variable.name
      },
      focus: "HH", 
      numClasses: 3,
      relationshipScheme: this.bivariateScheme
    };
    
    
    relationshipRendererCreator.createRenderer(this.mapService.bivariateParams).then((response) => {
      this.mapService.variableFL.renderer = response.renderer;
    });
    
    
  } 
  
  onToggleChange(event:any) {
    
    if (event.checked) {
      this.mapService.setMapMode(MapMode.bivariate);
    } else {
      this.mapService.setMapMode(MapMode.default);
      this.mapService.variableFL.renderer = this.mapService.defaultRenderer;
    }
    this.checked = event.checked;

  }

  isFormInvalid() {
    return (this.field1Control.invalid || this.field2Control.invalid);
  }

  isToggled() {
    return this.checked
  }

}
