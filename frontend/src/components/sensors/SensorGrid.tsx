import type { SensorData } from '../../types/sensor';
import { numeric, soilValue } from '../../utils/sensors';
import { SensorCard } from './SensorCard';
export function SensorGrid({data}: {data: SensorData | null}) { return <div className="sensor-grid">
 <SensorCard id="temperature" title="Temperatura" value={numeric(data?.temperature)} unit="°C" source={data?.temperatureSource === 'software' ? 'Simulador de software' : data?.temperatureSource === 'dht11' ? 'DHT11 · temperatura ambiental' : 'Origen sin confirmar'} color="orange" icon="☀" />
 <SensorCard id="humidity" title="Humedad del aire" value={numeric(data?.humidity)} unit="%" source={data?.humiditySource === 'software' ? 'Simulador de software' : data?.humiditySource === 'dht11' ? 'DHT11 · humedad relativa' : 'Origen sin confirmar'} color="blue" icon="◉" />
 <SensorCard id="soilMoisture" title="Humedad del suelo" value={soilValue(data)} source={data?.soilMoistureSource === 'software' ? 'Simulador de software' : 'Sensor resistivo · escala calibrada'} color="green" icon="≋" />
 <SensorCard id="ph" title="pH del suelo" value={numeric(data?.ph, 2)} unit="pH" source={data?.phSource === 'software' ? 'Simulador de software' : data?.phSource === 'potentiometer' ? 'Potenciómetro · pH simulado' : data?.phSource === 'calibrated-ph-probe' ? 'Sonda pH calibrada' : 'Origen sin confirmar'} color="purple" icon="◈" />
 </div>; }
