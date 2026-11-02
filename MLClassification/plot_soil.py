"""Optional offline report plots; matplotlib is NOT an application dependency."""
import csv
import json
from pathlib import Path
import argparse
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt


def plot(folder):
    crops = ['frijol', 'tomate', 'sandía', 'melón', 'lechuga']
    colors = ['#854d0e', '#dc2626', '#15803d', '#d97706', '#2563eb']
    with (folder/'soil_sensitivity.csv').open() as f:
        rows = list(csv.DictReader(f))
    for model in ['baseline', 'candidate']:
        fig, axes = plt.subplots(2, 3, figsize=(13, 7), sharex=True, sharey=True)
        for ax, ph in zip(axes.flat, [9.1, 5.8, 6.2, 6.5, 6.8, 7.2]):
            data = [r for r in rows if r['model'] == model and float(r['ph']) == ph]
            for crop, color in zip(crops, colors):
                ax.plot([float(r['soilMoisture']) for r in data],
                        [100*float(r['p_'+crop]) for r in data], '.-', color=color, label=crop)
            ax.axvspan(0, 20.15, color='gray', alpha=.12)
            ax.axvspan(90.83, 100, color='gray', alpha=.12)
            ax.set_title(f'pH {ph}'+(' — fuera de dominio' if ph == 9.1 else ''))
            ax.set_ylim(0, 102); ax.set_xlim(0, 100); ax.grid(alpha=.2)
            ax.set_xlabel('Suelo: escala relativa local (%)'); ax.set_ylabel('Salida predict_proba (%)')
        fig.legend(*axes.flat[0].get_legend_handles_labels(), loc='lower center', ncol=5)
        fig.suptitle(f'{model}: temperatura 26,7 °C, humedad ambiental 68,4 %\n'
                     'Probabilidades crudas para diagnóstico; NO idoneidad agrícola. Gris: suelo fuera del rango observado.')
        fig.tight_layout(rect=(0, .055, 1, .92))
        fig.savefig(folder/f'probabilities-{model}.png', dpi=160); plt.close(fig)
    with (folder/'histograms.csv').open() as f: rows = list(csv.DictReader(f))
    fig, axes = plt.subplots(2, 2, figsize=(12, 7))
    for ax, feature in zip(axes.flat, ['temperature', 'humidity', 'ph', 'soilMoisture']):
        for crop, color in zip(crops, colors):
            data = [r for r in rows if r['feature'] == feature and r['label'] == crop]
            ax.plot([(float(r['low'])+float(r['high']))/2 for r in data],
                    [int(r['count'])/2200 for r in data], color=color, label=crop)
        ax.set_title(feature); ax.set_ylabel('Fracción de muestras por intervalo'); ax.grid(alpha=.2)
    fig.legend(*axes.flat[0].get_legend_handles_labels(), loc='lower center', ncol=5)
    fig.suptitle('Distribuciones sintéticas por cultivo — 20 intervalos comunes por variable')
    fig.tight_layout(rect=(0, .055, 1, .95)); fig.savefig(folder/'distributions.png', dpi=160); plt.close(fig)
    report = json.loads((folder/'analysis.json').read_text())
    fig, ax = plt.subplots(figsize=(6, 5))
    ax.plot([0, 1], [0, 1], '--', color='gray', label='Referencia ideal')
    for name in ['baseline', 'candidate']:
        bins = report[name]['reliability_bins']
        ax.plot([b['confidence'] for b in bins], [b['accuracy'] for b in bins], 'o-', label=name)
    ax.set(xlabel='Probabilidad media de la clase ganadora', ylabel='Fracción de aciertos',
           title='Fiabilidad en test sintético aleatorio\nNo valida probabilidades fuera de dominio', xlim=(0,1), ylim=(0,1))
    ax.grid(alpha=.2); ax.legend(); fig.tight_layout(); fig.savefig(folder/'reliability.png', dpi=160); plt.close(fig)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(); parser.add_argument('folder', type=Path)
    plot(parser.parse_args().folder)
