import { AfterViewInit, Component, OnInit } from '@angular/core';
import {MatSliderModule} from '@angular/material/slider';
import { MapService } from '../services/map.service'
import { MapVariable } from '../shared/models/map-variable';
import { MapMode } from '../shared/enums/map-mode.enum';

import { NgxSliderModule } from '@angular-slider/ngx-slider';
import { Options } from '@angular-slider/ngx-slider';

import { Subscription } from 'rxjs';

import classBreaks from "@arcgis/core/smartMapping/statistics/classBreaks.js";
import ColorVariable from '@arcgis/core/renderers/visualVariables/ColorVariable';
import * as relationshipRendererCreator from "@arcgis/core/smartMapping/renderers/relationship.js";

import { MapDefExpression } from '../shared/models/map-def-expr';



@Component({
  selector: 'app-time-slider',
  imports: [MatSliderModule,NgxSliderModule],
  templateUrl: './time-slider.component.html',
  styleUrl: './time-slider.component.css'
})
export class TimeSliderComponent implements OnInit {
  private variableSubscription:Subscription;

  currentVariable?: MapVariable;
  defExpressions: MapDefExpression = {year:''};
  defExpressionString: string = '';

  constructor(private mapService: MapService) { 
    this.variableSubscription = this.mapService.getCurrentVariable().subscribe((variable) => {
      this.currentVariable = variable;
      // create in format needed for time slider
      this.yearsAvailable = variable.yearsAvailable.map(year => ({ value: year }));
      // console.log(variable.name, this.yearsAvailable)
      // set the slider steps array
      this.options = {
        stepsArray: this.yearsAvailable
      };

      if (!variable.yearsAvailable.includes(this.value)) {
        this.value = variable.yearsAvailable.at(-1) ?? 0;
      } 
    });
  }

  yearsAvailable: any = {};
  value: number = 0;
  options: Options = {
    stepsArray: this.yearsAvailable
  };

  ngOnInit(): void {
    
    this.mapService.getDefinitionExpressions().subscribe(exp => {
      console.log('DEFINITION EXPRESSIONS:',exp)
      this.defExpressions = exp;
      this.defExpressionString = Object.values(this.defExpressions).join(" and ");
      this.mapService.variableFL.definitionExpression = this.defExpressionString;
    })

    this.defExpressions.year = `year = ${this.value}`
    this.mapService.updateDefinitionExpressions(this.defExpressions);
    this.mapService.setCurrentYear(this.value);

    // this.mapService.variableFL.definitionExpression = `year = ${this.value}`;
    this.mapService.variableFL.definitionExpression = this.defExpressionString;
  }

  onValueChange(event:any): void{
    this.value = event;
    
    this.defExpressions.year = `year = ${this.value}`
    this.mapService.updateDefinitionExpressions(this.defExpressions);

    // this.mapService.variableFL.definitionExpression = `year = ${this.value}`;
    this.mapService.variableFL.definitionExpression = this.defExpressionString;

    

    classBreaks({
              layer: this.mapService.variableFL,
              field: this.currentVariable?.fieldName,
              classificationMethod: 'natural-breaks',
              numClasses:5
            }).then(res => {
              let breaks = res.classBreakInfos.map((info, i) => ({
                value: info.maxValue,
                label: info.label,
                color: this.mapService.defaultColors[i]
              }))

              breaks = breaks.map(x => this.mapService.roundBreakLabel(x));        
              
              if (this.currentVariable?.valueType === 'percentage') {
                breaks = breaks.map(x => this.mapService.addPercentSymbolToBreaks(x));    
              } else if (this.currentVariable?.valueType === 'money') {
                breaks = breaks.map(x => this.mapService.addMoneySymbolToBreaks(x));
              }
    
              const colorVariable = new ColorVariable({
                field: this.currentVariable?.fieldName,
                stops: breaks
              })
    
              this.mapService.getMapMode().subscribe((mode)=> {
                    if (mode == MapMode.default) {
                      this.mapService.defaultRenderer.visualVariables = [colorVariable];
                      this.mapService.variableFL.renderer = this.mapService.defaultRenderer;
                      this.mapService.legend.layerInfos = [{layer:this.mapService.variableFL}]
                    } else if (mode == MapMode.bivariate) {
                      relationshipRendererCreator.createRenderer(this.mapService.bivariateParams).then((response) => {
                            this.mapService.variableFL.renderer = response.renderer;
                      });
                    }
                  });
            })


  }
}


