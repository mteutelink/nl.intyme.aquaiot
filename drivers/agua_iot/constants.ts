export interface AguaEndpoint {
  key: string;
  name: string;
  customerCode: string;
  apiUrl: string;
  loginApiUrl?: string;
  brandId?: string;
  brand?: string;
}

export const ENDPOINTS: AguaEndpoint[] = [
  { key: 'Alfapalm', name: 'Alfapalm', customerCode: '862148', apiUrl: 'https://alfaplam.agua-iot.com' },
  { key: 'APP-O BIOEN', name: 'APP-O BIOEN', customerCode: '289982', apiUrl: 'https://unical.agua-iot.com' },
  { key: 'Boreal Home', name: 'Boreal Home', customerCode: '173118', apiUrl: 'https://boreal.agua-iot.com' },
  { key: 'Bronpi Home', name: 'Bronpi Home', customerCode: '164873', apiUrl: 'https://bronpi.agua-iot.com' },
  { key: 'Darwin Evolution', name: 'Darwin Evolution', customerCode: '475219', apiUrl: 'https://cola.agua-iot.com' },
  { key: 'Easy Connect', name: 'Easy Connect', customerCode: '354924', apiUrl: 'https://remote.mcz.it' },
  { key: 'Easy Connect Plus', name: 'Easy Connect Plus', customerCode: '746318', apiUrl: 'https://remote.mcz.it' },
  { key: 'Easy Connect Poêle', name: 'Easy Connect Poêle', customerCode: '354925', apiUrl: 'https://remote.mcz.it' },
  { key: 'Elcofire Pellet Home', name: 'Elcofire Pellet Home', customerCode: '132679', apiUrl: 'https://elcofire.agua-iot.com' },
  { key: 'Elfire Wifi', name: 'Elfire Wifi', customerCode: '402762', apiUrl: 'https://elfire.agua-iot.com' },
  { key: 'EvaCalòr - PuntoFuoco', name: 'EvaCalòr - PuntoFuoco', customerCode: '635987', apiUrl: 'https://evastampaggi.agua-iot.com' },
  { key: 'Fontana Forni', name: 'Fontana Forni', customerCode: '505912', apiUrl: 'https://fontanaforni.agua-iot.com' },
  { key: 'Fonte Flamme contrôle 1', name: 'Fonte Flamme contrôle 1', customerCode: '848324', apiUrl: 'https://fonteflame.agua-iot.com' },
  { key: 'Globe-fire', name: 'Globe-fire', customerCode: '634876', apiUrl: 'https://globefire.agua-iot.com' },
  { key: 'GO HEAT', name: 'GO HEAT', customerCode: '859435', apiUrl: 'https://amg.agua-iot.com' },
  { key: 'Jolly Mec Wi Fi', name: 'Jolly Mec Wi Fi', customerCode: '732584', apiUrl: 'https://jollymec.agua-iot.com' },
  { key: 'Karmek Wifi', name: 'Karmek Wifi', customerCode: '403873', apiUrl: 'https://karmekone.agua-iot.com' },
  { key: 'Klover Home', name: 'Klover Home', customerCode: '143789', apiUrl: 'https://klover.agua-iot.com' },
  { key: 'LAMINOX Remote Control (2.0)', name: 'LAMINOX Remote Control (2.0)', customerCode: '352678', apiUrl: 'https://laminox.agua-iot.com' },
  { key: 'Lorflam Home', name: 'Lorflam Home', customerCode: '121567', apiUrl: 'https://lorflam.agua-iot.com' },
  { key: 'Moretti design', name: 'Moretti design', customerCode: '624813', apiUrl: 'https://moretti.agua-iot.com' },
  { key: 'My Corisit', name: 'My Corisit', customerCode: '101427', apiUrl: 'https://mycorisit.agua-iot.com' },
  { key: 'MyPiazzetta', name: 'MyPiazzetta', customerCode: '458632', apiUrl: 'https://piazzetta.agua-iot.com', loginApiUrl: 'https://piazzetta-iot.app2cloud.it/api/bridge/endpoint/' },
  { key: 'MySuperior', name: 'MySuperior', customerCode: '458632', apiUrl: 'https://piazzetta.agua-iot.com', loginApiUrl: 'https://piazzetta-iot.app2cloud.it/api/bridge/endpoint/', brandId: '2', brand: 'superior' },
  { key: 'Nina', name: 'Nina', customerCode: '999999', apiUrl: 'https://micronova.agua-iot.com' },
  { key: 'Nobis-Fi', name: 'Nobis-Fi', customerCode: '700700', apiUrl: 'https://nobis.agua-iot.com' },
  { key: 'Nordic Fire 2.0', name: 'Nordic Fire 2.0', customerCode: '132678', apiUrl: 'https://nordicfire.agua-iot.com' },
  { key: 'Ravelli Wi-Fi', name: 'Ravelli Wi-Fi', customerCode: '953712', apiUrl: 'https://ravelli.agua-iot.com' },
  { key: 'Stufe a pellet Italia', name: 'Stufe a pellet Italia', customerCode: '015142', apiUrl: 'https://stufepelletitalia.agua-iot.com' },
  { key: 'Thermoflux', name: 'Thermoflux', customerCode: '391278', apiUrl: 'https://thermoflux.agua-iot.com' },
  { key: 'Total Control 3.0 (Extraflame)', name: 'Total Control 3.0 (Extraflame)', customerCode: '195764', apiUrl: 'https://extraflame.agua-iot.com/' },
  { key: 'TS Smart', name: 'TS Smart', customerCode: '046629', apiUrl: 'https://timsistem.agua-iot.com' },
  { key: 'TurboFonte', name: 'TurboFonte', customerCode: '354924', apiUrl: 'https://remote.mcz.it', brandId: '2', brand: 'turbofonte' },
  { key: 'Wi-Phire', name: 'Wi-Phire', customerCode: '521228', apiUrl: 'https://lineavz.agua-iot.com' }
];

export const AIR_VARIANTS = ['air', 'air2', 'air3', 'air_palm'];
export const WATER_VARIANTS = ['water', 'h2o', 'h2o_mandata'];

export const STATUS_OFF = [
  'OFF',
  'FINAL CLEANING',
  'STOP',
  'SHUT OFF',
  '0',
  '6'
];

export const STATUS_IDLE = [
  'ECO STOP',
  'STANDBY',
  'STAND BY',
  'STAND-BY',
  'ALARM',
  'MEMORY ALARM',
  'ALARM MEMORY',
  'MEM.ALM',
  'MEM. ALARM',
  '7',
  '8',
  '9'
];

export const DEFAULT_LANGUAGE = 'ENG';
