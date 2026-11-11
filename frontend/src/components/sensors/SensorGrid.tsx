import type { SensorData } from '../../types/sensor';
import { numeric, soilValue } from '../../utils/sensors';
import { SensorCard } from './SensorCard';
export function SensorGrid({data}: {data: SensorData | null}) { return <div className="sensor-grid">
 <SensorCard id="temperature" title="Temperatura" value={numeric(data?.temperature)} unit="°C" source="DHT11 · temperatura ambiental" color="orange" icon="☀" />
 <SensorCard id="humidity" title="Humedad del aire" value={numeric(data?.humidity)} unit="%" source="DHT11 · humedad relativa" color="blue" icon="◉" />
 <SensorCard id="soilMoisture" title="Humedad del suelo" value={soilValue(data)} source={data?.soilMoistureSource === 'software' ? 'Simulador de software' : 'Sensor resistivo · escala calibrada'} color="green" icon="≋" />
 <SensorCard id="ph" title="pH del suelo" value={numeric(data?.ph, 2)} unit="pH" source="Potenciómetro · pH simulado" color="purple" icon="◈" />
 </div>; }
