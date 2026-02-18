import {
  Component, OnInit, OnDestroy, ViewChild, ElementRef,
  AfterViewInit, ChangeDetectorRef
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription, combineLatest } from 'rxjs';
import { debounceTime, distinctUntilChanged, filter } from 'rxjs/operators';

import { Chart, registerables } from 'chart.js';
Chart.register(...registerables);

import { MapService } from '../services/map.service';
import { MapVariable } from '../shared/models/map-variable';
import Query from '@arcgis/core/rest/support/Query.js';
import { executeQueryJSON } from '@arcgis/core/rest/query.js';

@Component({
  selector: 'app-tract-chart',
  imports: [CommonModule],
  templateUrl: './tract-chart.component.html',
  styleUrl: './tract-chart.component.css'
})
export class TractChartComponent implements OnInit, OnDestroy, AfterViewInit {

  @ViewChild('chartCanvas') chartCanvas!: ElementRef<HTMLCanvasElement>;

  visible = false;
  loading = false;
  tractName = '';
  variableName = '';

  private chart: Chart | null = null;
  private subs: Subscription[] = [];
  private currentVariable: MapVariable | null = null;
  private currentTractId: string | null = null;
  private currentCountyName: string | null = null;

  constructor(private mapService: MapService, private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    // Track current variable
    this.subs.push(
      this.mapService.getCurrentVariable().subscribe(v => {
        this.currentVariable = v;
        // Reload chart if a tract is already hovered
        if (this.currentTractId) {
          this.loadChartData(this.currentTractId);
        }
      })
    );

    // React to hovered tract changes (debounced to avoid hammering the server)
    this.subs.push(
      this.mapService.getHoveredTractId().pipe(
        debounceTime(300),
        distinctUntilChanged()
      ).subscribe(tractId => {
        this.currentTractId = tractId;
        if (tractId) {
          this.visible = true;
          this.loadChartData(tractId);
        } else {
          this.visible = false;
          this.cdr.detectChanges();
        }
      })
    );
  }

  ngAfterViewInit(): void {}

  ngOnDestroy(): void {
    this.subs.forEach(s => s.unsubscribe());
    this.chart?.destroy();
  }

  private formatValue(raw: any, valueType: string): number {
    if (raw == null || raw === '' || isNaN(raw)) return 0;
    return Math.round(parseFloat(raw) * 10) / 10;
  }

  private formatLabel(value: number, valueType: string): string {
    if (valueType === 'percentage') return `${value}%`;
    if (valueType === 'money') {
      return new Intl.NumberFormat('en-US', {
        style: 'currency', currency: 'USD', maximumFractionDigits: 0
      }).format(value);
    }
    return value.toLocaleString();
  }

  async loadChartData(tractId: string): Promise<void> {
    if (!this.currentVariable) return;
    const variable = this.currentVariable;
    const years = variable.yearsAvailable.slice().sort((a, b) => a - b);
    const fieldName = variable.fieldName;

    this.loading = true;
    this.cdr.detectChanges();

    try {
      const layer = this.mapService.variableFL;
      // Query the layer's source URL directly so the layer's current
      // definition expression (year filter) is bypassed, giving us
      // all years for the chart history.
      // layer.url for a FeatureLayer includes the full REST endpoint (with layer ID).
      const layerUrl = layer.url;
      if (!layerUrl) {
        this.loading = false;
        this.cdr.detectChanges();
        return;
      }

      // ── Query 1: this specific tract across all years ──
      const tractQuery = new Query();
      tractQuery.where = `crdt_unique_id = '${tractId}'`;
      tractQuery.outFields = [fieldName, 'year', 'name', 'county_name', 'crdt_unique_id'];
      tractQuery.returnGeometry = false;

      // ── Query 2: county average — need county_name from this tract first ──
      // We'll get it from the tract query result, then issue a second query

      const tractResult = await executeQueryJSON(layerUrl, tractQuery);

      if (!tractResult.features.length) {
        this.loading = false;
        this.cdr.detectChanges();
        return;
      }

      // Extract tract name and county name from attributes
      const firstAttrs = tractResult.features[0].attributes;
      this.tractName = firstAttrs['name'] || tractId;
      this.currentCountyName = firstAttrs['county_name'] || null;
      this.variableName = variable.name;

      // Build tract series: map year → value
      const tractByYear: Record<number, number> = {};
      tractResult.features.forEach(f => {
        const yr = f.attributes['year'];
        tractByYear[yr] = this.formatValue(f.attributes[fieldName], variable.valueType);
      });
      const tractSeries = years.map(y => tractByYear[y] ?? null);

      // ── Query 3: county-level average across all tracts in county ──
      let countySeries: (number | null)[] = years.map(() => null);
      if (this.currentCountyName) {
        const countyQuery = new Query();
        countyQuery.where = `county_name = '${this.currentCountyName}'`;
        countyQuery.outFields = [fieldName, 'year'];
        countyQuery.returnGeometry = false;

        const countyResult = await executeQueryJSON(layerUrl, countyQuery);
        // Group by year, compute mean
        const countyByYear: Record<number, number[]> = {};
        countyResult.features.forEach(f => {
          const yr = f.attributes['year'];
          const val = f.attributes[fieldName];
          if (val != null && !isNaN(val)) {
            if (!countyByYear[yr]) countyByYear[yr] = [];
            countyByYear[yr].push(parseFloat(val));
          }
        });
        countySeries = years.map(y => {
          const vals = countyByYear[y];
          if (!vals || !vals.length) return null;
          const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
          return Math.round(avg * 10) / 10;
        });
      }

      // ── Query 4: region-wide average across all tracts ──
      const regionQuery = new Query();
      regionQuery.where = `1=1`;
      regionQuery.outFields = [fieldName, 'year'];
      regionQuery.returnGeometry = false;

      const regionResult = await executeQueryJSON(layerUrl, regionQuery);
      const regionByYear: Record<number, number[]> = {};
      regionResult.features.forEach(f => {
        const yr = f.attributes['year'];
        const val = f.attributes[fieldName];
        if (val != null && !isNaN(val)) {
          if (!regionByYear[yr]) regionByYear[yr] = [];
          regionByYear[yr].push(parseFloat(val));
        }
      });
      const regionSeries = years.map(y => {
        const vals = regionByYear[y];
        if (!vals || !vals.length) return null;
        const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
        return Math.round(avg * 10) / 10;
      });

      this.loading = false;
      this.cdr.detectChanges();

      // Render chart after view is updated
      setTimeout(() => this.renderChart(years, tractSeries, countySeries, regionSeries, variable), 50);

    } catch (e) {
      console.error('TractChart query error:', e);
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  private renderChart(
    years: number[],
    tractSeries: (number | null)[],
    countySeries: (number | null)[],
    regionSeries: (number | null)[],
    variable: MapVariable
  ): void {
    if (!this.chartCanvas) return;
    const ctx = this.chartCanvas.nativeElement.getContext('2d');
    if (!ctx) return;

    this.chart?.destroy();

    const countyLabel = this.currentCountyName ? `${this.currentCountyName} Avg` : 'County Avg';

    this.chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: years.map(String),
        datasets: [
          {
            label: this.tractName,
            data: tractSeries,
            borderColor: '#90caf9',
            backgroundColor: 'rgba(144,202,249,0.12)',
            borderWidth: 2.5,
            pointRadius: 3,
            pointHoverRadius: 5,
            tension: 0.3,
            fill: false,
          },
          {
            label: countyLabel,
            data: countySeries,
            borderColor: '#77791e',
            backgroundColor: 'rgba(119,121,30,0.1)',
            borderWidth: 2,
            borderDash: [5, 3],
            pointRadius: 2,
            pointHoverRadius: 4,
            tension: 0.3,
            fill: false,
          },
          {
            label: 'Region Avg',
            data: regionSeries,
            borderColor: '#888',
            backgroundColor: 'rgba(136,136,136,0.08)',
            borderWidth: 1.5,
            borderDash: [3, 3],
            pointRadius: 2,
            pointHoverRadius: 4,
            tension: 0.3,
            fill: false,
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              color: '#b0b0b0',
              font: { size: 10 },
              boxWidth: 14,
              padding: 8
            }
          },
          tooltip: {
            backgroundColor: 'rgba(20,20,20,0.95)',
            titleColor: '#e0e0e0',
            bodyColor: '#c0c0c0',
            borderColor: '#383838',
            borderWidth: 1,
            callbacks: {
              label: (ctx) => {
                const val = ctx.parsed.y;
                if (val == null) return `${ctx.dataset.label}: N/A`;
                return `${ctx.dataset.label}: ${this.formatLabel(val, variable.valueType)}`;
              }
            }
          }
        },
        scales: {
          x: {
            ticks: { color: '#888', font: { size: 10 } },
            grid: { color: 'rgba(255,255,255,0.05)' }
          },
          y: {
            ticks: {
              color: '#888',
              font: { size: 10 },
              callback: (val) => this.formatLabel(Number(val), variable.valueType)
            },
            grid: { color: 'rgba(255,255,255,0.07)' }
          }
        }
      }
    });
  }
}
