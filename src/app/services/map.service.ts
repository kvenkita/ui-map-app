import { Injectable } from '@angular/core';
import { from, Observable, Observer, of, BehaviorSubject } from 'rxjs';

import { Project } from '../shared/models/project';
import { PROJECT } from '../shared/mocks/mock-project';

import { Map as ModelMap } from '../shared/models/map'
import { MAPS } from '../shared/mocks/mock-map';

import { MapCategory } from '../shared/models/map-category'
import { MAP_CATEGORY } from '../shared/mocks/mock-map-category';

import { MapVariable } from '../shared/models/map-variable'
import { MAP_VARIABLE } from '../shared/mocks/mock-map-variable';

import { Extent } from '../shared/models/extent'
import { EXTENT } from '../shared/mocks/mock-extent';

import { MapMode } from '../shared/enums/map-mode.enum';

import { MapDefExpression } from '../shared/models/map-def-expr'

import Map from '@arcgis/core/Map';
import MapView from '@arcgis/core/views/MapView';
import FeatureLayer from '@arcgis/core/layers/FeatureLayer';
import { SimpleRenderer, UniqueValueRenderer } from "@arcgis/core/renderers";
import SimpleFillSymbol from "@arcgis/core/symbols/SimpleFillSymbol.js";
import ColorVariable from "@arcgis/core/renderers/visualVariables/ColorVariable.js";
import Legend from "@arcgis/core/widgets/Legend.js";
import GraphicsLayer from "@arcgis/core/layers/GraphicsLayer.js";
import { Extent as EsriExtent } from "@arcgis/core/geometry";
import classBreaks from "@arcgis/core/smartMapping/statistics/classBreaks.js";

@Injectable({
  providedIn: 'root'
})
export class MapService {
  project!: Project;
  mapCategories: MapCategory[] = [];
  mapVariables: MapVariable[] = [];
  extents: Extent[] = EXTENT;
  esriMap!: Map;
  mapView!: MapView;
  colorVariable: ColorVariable = new ColorVariable();
  defaultColors: string[] = ["#eefae3", "#bae4bc", "#bae4bc", "#43a2ca", "#0868ac"];
  variableFL: FeatureLayer = new FeatureLayer();
  legend: Legend = new Legend()
  graphicsLayer = new GraphicsLayer();
  bivariateParams: any = {};

  autocorrelationDefaultSymbol = 
    new SimpleFillSymbol({
      color: "#e6e8e7",
      style: "solid",
      outline: {
        color: [0, 0, 0, 0.2],
        width: "2px"
      },
    })


  autocorrelationRenderer = new UniqueValueRenderer({
    defaultSymbol:this.autocorrelationDefaultSymbol,
    defaultLabel:'No significant clustering pattern',
    uniqueValueInfos: [{
      value: "HH",
      symbol: new SimpleFillSymbol({
        color: "#FF8A65",
        style: "solid",
        outline: {
          color: [0, 0, 0, 0.2],
          width: "2px"
        }
      }),
      label: 'High-High (Areas with high value clustered with high value neighbors)'
    },
    {
      value: "HL",
      symbol: new SimpleFillSymbol({
        color: "#FFCCBC",
        style: "solid",
        outline: {
          color: [0, 0, 0, 0.2],
          width: "2px"
        }
      }),
      label: 'High-Low (Areas with high value clustered with low value neighbors)'
    },
    {
      value: "LH",
      symbol: new SimpleFillSymbol({
        color: "#4FC3F7",
        style: "solid",
        outline: {
          color: [0, 0, 0, 0.2],
          width: "2px"
        }
      }),
      label: 'Low-High (Areas with low value clustered with high value neighbors)'
    },
    {
        value: "LL",
        symbol: new SimpleFillSymbol({
          color: "#0288D1",
          style: "solid",
          outline: {
            color: [0, 0, 0, 0.2],
            width: "2px"
          }
        }),
        label: 'Low-Low (Areas with low value clustered with low value neighbors)'
      }]
  })

  defaultRenderer = new SimpleRenderer({
    symbol: new SimpleFillSymbol({
      color: [230, 232, 230],
      style: "solid",
      outline: {
        color: [0, 0, 0, 0.2],
        width: "2px"
      }
    }),
    visualVariables: [this.colorVariable]
  })

  private currentCategory = new BehaviorSubject<MapCategory>(MAP_CATEGORY[0]);
  private currentVariable = new BehaviorSubject<MapVariable>(MAP_VARIABLE[0]);
  private isSidenavOpen = new BehaviorSubject<boolean>(false);
  private mapMode = new BehaviorSubject<MapMode>(MapMode.default);
  private definitionExpressions = new BehaviorSubject<MapDefExpression>({year:''});
  private currentYear = new BehaviorSubject<number>(0);
  private hoveredTractId = new BehaviorSubject<string | null>(null);
  projectMaps?: Observable<ModelMap[]>;

  constructor() { }

  getProjectById(id: number): Observable<Project> {
    return of(PROJECT.filter((project) => project.projectId === id).reduce((acc: any, it) => it, {}));
  }

  getMapCategories(): Observable<MapCategory[]> {
    return of(MAP_CATEGORY.filter(mc => this.project?.mapCategories.includes(mc.categoryId)));
  }

  getMapVariables(mapVariables: Number[]): Observable<MapVariable[]> {
    return of(MAP_VARIABLE.filter(mv => mapVariables.includes(mv.variableId)));
  }

  getCurrentCategory(): Observable<MapCategory> {
    return this.currentCategory.asObservable();
  }

  updateCurrentCategory(newCategory: MapCategory) {
    this.currentCategory.next(newCategory)
  }

  getCurrentVariable(): Observable<MapVariable> {
    return this.currentVariable.asObservable();
  }

  updateCurrentVariable(newVariable: MapVariable) {
    this.currentVariable.next(newVariable)
  }

  getDefinitionExpressions(): Observable<MapDefExpression> {
    return this.definitionExpressions.asObservable()
  }

  updateDefinitionExpressions(updatedDefExpressions: MapDefExpression) {
    return this.definitionExpressions.next(updatedDefExpressions);
  }

  getSidenavOpen() {
    return this.isSidenavOpen.asObservable();
  }

  setSidenavOpen(state: boolean) {
    return this.isSidenavOpen.next(state);
  }

  getCurrentYear(): Observable<number> {
    return this.currentYear.asObservable();
  }

  setCurrentYear(year: number) {
    this.currentYear.next(year);
  }

  getHoveredTractId(): Observable<string | null> {
    return this.hoveredTractId.asObservable();
  }

  setHoveredTractId(id: string | null) {
    this.hoveredTractId.next(id);
  }

  getMapMode() {
    return this.mapMode.asObservable();
  }

  setMapMode(mode: MapMode) {
    return this.mapMode.next(mode);
  }

  getExtents() {
    return of(this.extents);
  }

  getMaps(): Observable<ModelMap[]> {
    const mapIds = this.project.maps.map(m => m.mapId);
    return of(MAPS.filter(map => mapIds.includes(map.mapId)));
  }

  updateMaps(maps: ModelMap[]) {
    this.projectMaps = of(maps)
  }

  roundBreakLabel(obj: any): any {
    const [startStr, endStr] = obj.label.split(" - ");
    const start = Math.round(parseFloat(startStr) * 10) / 10;
    const end = Math.round(parseFloat(endStr) * 10) / 10;
    return { value: end, label: `${start} - ${end}`, color: obj.color };
  }

  addPercentSymbolToBreaks(obj: any): any {
    const [startStr, endStr] = obj.label.split(" - ");
    return { value: obj.value, label: `${startStr}% - ${endStr}%`, color: obj.color };
  }

  addMoneySymbolToBreaks(obj: any): any {
    const [startStr, endStr] = obj.label.split(" - ");
    const startStrFormatted = new Intl.NumberFormat('en-US').format(startStr);
    const endStrFormatted = new Intl.NumberFormat('en-US').format(endStr);
    return { value: obj.value, label: `$${startStrFormatted} - $${endStrFormatted}`, color: obj.color };
  }

  clearSelectedFeatures() {
    this.graphicsLayer.removeAll();
  }

  toggleMapVisibility() {
    const visibility = !this.variableFL.visible;
    this.variableFL.visible = visibility;
  }

  zoomSelectedFeature() {
    try {
      const graphicExtent = this.graphicsLayer.graphics.getItemAt(0)!.geometry!.extent!

      let extent = new EsriExtent({
        xmin: graphicExtent.xmin,
        ymin: graphicExtent.ymin,
        xmax: graphicExtent.xmax,
        ymax: graphicExtent.ymax,
        spatialReference: { wkid: 4326 }
      })

      this.mapView.goTo(extent);
    } catch { }
  }

  renderVariable(variable: MapVariable, fieldName:string, mapMode: MapMode) {

    // console.log('VARIABLE:', variable.name);
    if (mapMode == MapMode.default) {
      classBreaks({
        layer: this.variableFL,
        field: fieldName,
        classificationMethod: 'natural-breaks',
        numClasses: 5
      }).then(res => {
        let breaks = res.classBreakInfos.map((info, i) => ({
          value: info.maxValue,
          label: info.label,
          color: this.defaultColors[i]
        }))

        breaks = breaks.map(x => this.roundBreakLabel(x));

        if (variable.valueType === 'percentage') {
          breaks = breaks.map(x => this.addPercentSymbolToBreaks(x));
        } else if (variable.valueType === 'money') {
          breaks = breaks.map(x => this.addMoneySymbolToBreaks(x));
        }

        const colorVariable = new ColorVariable({
          field: variable.fieldName,
          stops: breaks
        })

        // Create a fresh renderer each time so ArcGIS detects the change
        // and the Legend widget updates correctly.
        this.variableFL.renderer = new SimpleRenderer({
          symbol: new SimpleFillSymbol({
            color: [230, 232, 230],
            style: 'solid',
            outline: {
              color: [0, 0, 0, 0.2],
              width: '2px'
            }
          }),
          visualVariables: [colorVariable]
        });
        this.legend.layerInfos = [{layer: this.variableFL}];
      })
    } else if (mapMode == MapMode.autocorrelation) {
      this.autocorrelationRenderer.field = fieldName;
      this.variableFL.renderer = this.autocorrelationRenderer;
      this.legend.layerInfos = [{layer: this.variableFL}];
    }
  }
}
