import axios, { AxiosInstance } from 'axios';
import { Parser } from 'expr-eval';

export interface AguaIotClientOptions {
  apiUrl: string;
  customerCode: string;
  email: string;
  password: string;
  uniqueId: string;
  loginApiUrl?: string;
  brandId?: string;
  brand?: string;
  applicationVersion?: string;
  airTempFix?: boolean;
  readingErrorFix?: boolean;
  language?: string;
  httpTimeout?: number;
  bufferReadTimeout?: number;
}

export interface AguaIotDeviceSummary {
  id: string;
  idDevice: string;
  idProduct: string;
  productSerial: string;
  name: string;
  isOnline: boolean;
  nameProduct: string;
  idRegistersMap: string;
}

interface RegisterMapEntry {
  reg_key: string;
  offset: number;
  mask: number;
  formula: string;
  formula_inverse: string;
  set_min: number;
  set_max: number;
  is_hex: boolean;
  reg_type?: string;
  format_string?: string;
  step?: number;
  enc_val?: Array<{ value: number; description: string; lang: string }>;
  enable_val?: Array<{ value: number; description?: string; lang?: string }>;
}

interface DeviceInfoResponse {
  device_info: Array<{ id_registers_map: string }>;
}

const API_PATH_APP_SIGNUP = '/appSignup';
const API_PATH_LOGIN = '/userLogin';
const API_PATH_REFRESH_TOKEN = '/refreshToken';
const API_PATH_DEVICE_LIST = '/deviceList';
const API_PATH_DEVICE_INFO = '/deviceGetInfo';
const API_PATH_DEVICE_REGISTERS_MAP = '/deviceGetRegistersMap';
const API_PATH_DEVICE_BUFFER_READING = '/deviceGetBufferReading';
const API_PATH_DEVICE_JOB_STATUS = '/deviceJobStatus/';
const API_PATH_DEVICE_WRITING = '/deviceRequestWriting';

const parser = new Parser({
  operators: {
    logical: true,
    comparison: true,
    conditional: true,
    add: true,
    multiply: true,
    divide: true,
    power: true
  }
});

export class AguaIotClient {
  private readonly apiUrl: string;
  private readonly customerCode: string;
  private readonly email: string;
  private readonly password: string;
  private readonly uniqueId: string;
  private readonly loginApiUrl?: string;
  private readonly brandId?: string;
  private readonly brand?: string;
  private readonly applicationVersion: string;
  private readonly airTempFix: boolean;
  private readonly readingErrorFix: boolean;
  private readonly language: string;
  private readonly httpTimeout: number;
  private readonly bufferReadTimeout: number;
  private readonly httpClient: AxiosInstance;
  private token: string | null = null;
  private tokenExpires: number | null = null;
  private refreshToken: string | null = null;

  constructor(options: AguaIotClientOptions) {
    this.apiUrl = options.apiUrl.replace(/\/$/, '');
    this.customerCode = options.customerCode;
    this.email = options.email;
    this.password = options.password;
    this.uniqueId = options.uniqueId;
    this.loginApiUrl = options.loginApiUrl;
    this.brandId = options.brandId;
    this.brand = options.brand;
    this.applicationVersion = options.applicationVersion ?? '1.9.7';
    this.airTempFix = options.airTempFix ?? false;
    this.readingErrorFix = options.readingErrorFix ?? false;
    this.language = options.language ?? 'ENG';
    this.httpTimeout = options.httpTimeout ?? 30_000;
    this.bufferReadTimeout = options.bufferReadTimeout ?? 30_000;

    this.httpClient = axios.create({
      timeout: this.httpTimeout
    });
  }

  async connect(): Promise<AguaIotDevice[]> {
    await this.registerAppId();
    await this.login();
    return this.fetchDevices();
  }

  getLanguage(): string {
    return this.language;
  }

  getAirTempFix(): boolean {
    return this.airTempFix;
  }

  getReadingErrorFix(): boolean {
    return this.readingErrorFix;
  }

  private headers(): Record<string, string> {
    const headers: Record<string, string> = {
      Accept: 'application/json, text/javascript, */*; q=0.01',
      'Content-Type': 'application/json',
      Origin: 'file://',
      id_brand: this.brandId ?? '1',
      customer_code: this.customerCode
    };
    if (this.brand) {
      headers.brand = this.brand;
    }
    return headers;
  }

  async registerAppId(): Promise<void> {
    const url = `${this.apiUrl}${API_PATH_APP_SIGNUP}`;
    const payload = {
      phone_type: 'Android',
      phone_id: this.uniqueId,
      phone_version: '1.0',
      language: 'en',
      id_app: this.uniqueId,
      push_notification_token: this.uniqueId,
      push_notification_active: false
    };

    const response = await this.httpClient.post(url, payload, {
      headers: this.headers()
    });

    if (response.status !== 201) {
      throw new Error(`Failed to register app id: ${response.status} ${response.data}`);
    }
  }

  async login(): Promise<void> {
    let url = `${this.apiUrl}${API_PATH_LOGIN}`;
    const payload = { email: this.email, password: this.password };

    const headers = {
      ...this.headers(),
      local: 'true',
      Authorization: this.uniqueId
    };

    if (this.loginApiUrl) {
      url = this.loginApiUrl;
      Object.assign(headers, {
        applicationversion: this.applicationVersion,
        url: API_PATH_LOGIN.replace('/', ''),
        userid: 'null',
        aguaid: 'null'
      });
    }

    const response = await this.httpClient.post(url, payload, { headers });
    if (response.status !== 200) {
      throw new Error(`Failed to login: ${response.status} ${response.data}`);
    }

    this.token = response.data.token;
    this.refreshToken = response.data.refresh_token;
    this.tokenExpires = this.decodeTokenExpiry(this.token);
  }

  private decodeTokenExpiry(token: string): number | null {
    try {
      const payload = token.split('.')[1];
      const decoded = JSON.parse(Buffer.from(payload, 'base64').toString('utf8'));
      return decoded.exp ?? null;
    } catch (err) {
      return null;
    }
  }

  private async refreshAuthToken(): Promise<void> {
    if (!this.refreshToken) {
      await this.login();
      return;
    }

    const url = `${this.apiUrl}${API_PATH_REFRESH_TOKEN}`;
    const payload = { refresh_token: this.refreshToken };

    const response = await this.httpClient.post(url, payload, { headers: this.headers() });
    if (response.status !== 201) {
      await this.login();
      return;
    }

    this.token = response.data.token;
    this.tokenExpires = this.decodeTokenExpiry(this.token);
  }

  private async ensureToken(): Promise<void> {
    if (this.tokenExpires && Date.now() / 1000 > this.tokenExpires) {
      await this.refreshAuthToken();
    }
  }

  private async handleWebCall<T>(method: 'GET' | 'POST', url: string, payload: Record<string, unknown>): Promise<T> {
    await this.ensureToken();

    const headers = {
      ...this.headers(),
      local: 'false',
      Authorization: this.token ?? ''
    };

    try {
      const response = method === 'POST'
        ? await this.httpClient.post(url, payload, { headers })
        : await this.httpClient.get(url, { params: payload, headers });

      if (response.status === 401) {
        await this.refreshAuthToken();
        return this.handleWebCall(method, url, payload);
      }

      if (response.status !== 200) {
        throw new Error(`Webcall failed: ${response.status} ${response.data}`);
      }

      return response.data as T;
    } catch (err) {
      throw new Error(`Connection error to ${url}: ${(err as Error).message}`);
    }
  }

  async fetchDevices(): Promise<AguaIotDevice[]> {
    const url = `${this.apiUrl}${API_PATH_DEVICE_LIST}`;
    const response = await this.handleWebCall<{ device: Array<any> }>('POST', url, {});

    const devices: AguaIotDevice[] = [];
    for (const dev of response.device ?? []) {
      const info = await this.fetchDeviceInfo(dev.id_device, dev.id_product);
      devices.push(new AguaIotDevice(
        {
          id: dev.id,
          idDevice: dev.id_device,
          idProduct: dev.id_product,
          productSerial: dev.product_serial,
          name: dev.name,
          isOnline: dev.is_online,
          nameProduct: dev.name_product,
          idRegistersMap: info.id_registers_map
        },
        this
      ));
    }

    return devices;
  }

  private async fetchDeviceInfo(idDevice: string, idProduct: string): Promise<{ id_registers_map: string }> {
    const url = `${this.apiUrl}${API_PATH_DEVICE_INFO}`;
    const response = await this.handleWebCall<DeviceInfoResponse>('POST', url, {
      id_device: idDevice,
      id_product: idProduct
    });
    return response.device_info[0];
  }

  async fetchDeviceRegisterMap(idDevice: string, idProduct: string, idRegistersMap: string): Promise<Record<string, RegisterMapEntry>> {
    const url = `${this.apiUrl}${API_PATH_DEVICE_REGISTERS_MAP}`;
    const response = await this.handleWebCall<any>('POST', url, {
      id_device: idDevice,
      id_product: idProduct,
      last_update: '2018-06-03T08:59:54.043'
    });

    const registerMap = response.device_registers_map?.registers_map ?? [];
    const target = registerMap.find((map: any) => map.id === idRegistersMap);
    const registers: Record<string, RegisterMapEntry> = {};
    for (const reg of target?.registers ?? []) {
      registers[reg.reg_key.toLowerCase()] = reg as RegisterMapEntry;
    }
    return registers;
  }

  async readDeviceBuffer(idDevice: string, idProduct: string): Promise<Record<number, number>> {
    const url = `${this.apiUrl}${API_PATH_DEVICE_BUFFER_READING}`;
    const response = await this.handleWebCall<any>('POST', url, {
      id_device: idDevice,
      id_product: idProduct,
      BufferId: 1
    });

    const idRequest = response.idRequest;
    const statusUrl = `${this.apiUrl}${API_PATH_DEVICE_JOB_STATUS}${idRequest}`;
    const start = Date.now();
    let delay = 1_000;

    while (Date.now() - start < this.bufferReadTimeout) {
      await new Promise((resolve) => setTimeout(resolve, delay));
      const status = await this.handleWebCall<any>('GET', statusUrl, {});
      if (status.jobAnswerStatus !== 'waiting') {
        if (status.jobAnswerStatus !== 'completed') {
          throw new Error(`Unexpected job status: ${status.jobAnswerStatus}`);
        }

        const information: Record<number, number> = {};
        const items = status.jobAnswerData?.Items ?? [];
        const values = status.jobAnswerData?.Values ?? [];
        for (let i = 0; i < items.length; i += 1) {
          information[items[i]] = values[i];
        }
        return information;
      }

      delay += 1_000;
    }

    throw new Error(`Timeout waiting for buffer read after ${this.bufferReadTimeout}ms`);
  }

  async writeDeviceValues(idDevice: string, idProduct: string, payload: { items: number[]; masks: number[]; values: number[] }): Promise<void> {
    const url = `${this.apiUrl}${API_PATH_DEVICE_WRITING}`;
    const body = {
      id_device: idDevice,
      id_product: idProduct,
      Protocol: 'RWMSmaster',
      BitData: payload.items.map(() => 8),
      Endianess: payload.items.map(() => 'L'),
      Items: payload.items,
      Masks: payload.masks,
      Values: payload.values
    };

    const response = await this.handleWebCall<any>('POST', url, body);
    const idRequest = response.idRequest;
    const statusUrl = `${this.apiUrl}${API_PATH_DEVICE_JOB_STATUS}${idRequest}`;

    for (let attempt = 0; attempt < 10; attempt += 1) {
      const status = await this.handleWebCall<any>('GET', statusUrl, {});
      if (status.jobAnswerStatus === 'completed' && status.jobAnswerData?.Cmd) {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }

    throw new Error('Error while request device writing');
  }
}

export class AguaIotDevice {
  private readonly summary: AguaIotDeviceSummary;
  private readonly client: AguaIotClient;
  private registerMap: Record<string, RegisterMapEntry> = {};
  private information: Record<number, number> = {};

  constructor(summary: AguaIotDeviceSummary, client: AguaIotClient) {
    this.summary = summary;
    this.client = client;
  }

  get data(): AguaIotDeviceSummary {
    return this.summary;
  }

  get registers(): string[] {
    return Object.keys(this.registerMap);
  }

  async initialize(): Promise<void> {
    this.registerMap = await this.client.fetchDeviceRegisterMap(
      this.summary.idDevice,
      this.summary.idProduct,
      this.summary.idRegistersMap
    );
  }

  async update(): Promise<void> {
    this.information = await this.client.readDeviceBuffer(this.summary.idDevice, this.summary.idProduct);
  }

  getRegister(key: string): RegisterMapEntry | null {
    const register = this.registerMap[key.toLowerCase()];
    if (!register) {
      return null;
    }

    const valueRaw = this.information[register.offset] ?? 0;
    const masked = valueRaw & register.mask;
    const formula = register.formula?.replace(/#/g, masked.toString()).replace(/Mod/g, '%');

    let value: number | undefined;
    try {
      value = parser.evaluate(formula ?? '0', {
        IF: (a: boolean, b: number, c: number) => (a ? b : c),
        int: (a: number) => Math.trunc(a)
      });
    } catch (err) {
      value = undefined;
    }

    return {
      ...register,
      value_raw: masked.toString(),
      value
    } as RegisterMapEntry & { value_raw: string; value?: number };
  }

  getRegisterValue(key: string): number | undefined {
    const register = this.getRegister(key);
    if (!register) {
      return undefined;
    }

    const valueRaw = Number((register as any).value_raw ?? 0);
    const value = (register as any).value;

    if (this.client.getReadingErrorFix() && valueRaw === 32768) {
      return undefined;
    }

    if (this.client.getAirTempFix() && key.endsWith('air_get') && value && value > 100) {
      return undefined;
    }

    return value;
  }

  getRegisterValueDescription(key: string, language?: string): string | number | undefined {
    const register = this.getRegister(key);
    if (!register) {
      return undefined;
    }

    const options = this.getRegisterValueOptions(key, language);
    const value = this.getRegisterValue(key);
    if (options && value !== undefined) {
      return options[value] ?? value;
    }

    return value;
  }

  getRegisterValueMin(key: string): number | undefined {
    return this.registerMap[key.toLowerCase()]?.set_min;
  }

  getRegisterValueMax(key: string): number | undefined {
    return this.registerMap[key.toLowerCase()]?.set_max;
  }

  getRegisterValueOptions(key: string, language?: string): Record<number, string> {
    const register = this.registerMap[key.toLowerCase()];
    if (!register?.enc_val) {
      return {};
    }

    const lang = (language ?? this.client.getLanguage()) || 'ENG';
    const available = new Set(register.enc_val.map((item) => item.lang));
    const resolvedLang = available.has(lang) ? lang : 'ENG';

    return Object.fromEntries(
      register.enc_val
        .filter((item) => item.lang === resolvedLang)
        .map((item) => [item.value, item.description])
    );
  }

  getRegisterEnabled(key: string): boolean {
    const enableKey = `${key.split('_').slice(0, -1).join('_')}_enable`;
    const enableRegister = this.registerMap[enableKey];
    if (!enableRegister) {
      return true;
    }

    if (enableRegister.reg_type !== 'ENABLE') {
      throw new Error(`Not a register of type ENABLE: ${key}`);
    }

    if (enableRegister.enable_val?.length) {
      const allowed = enableRegister.enable_val.map((item) => item.value);
      const value = this.getRegisterValue(enableKey);
      return value !== undefined && allowed.includes(value);
    }

    return this.getRegisterValue(enableKey) === 1;
  }

  private prepareValueForWriting(key: string, value: number, limitValueRaw = false): number {
    const register = this.registerMap[key.toLowerCase()];
    if (!register) {
      throw new Error(`Unknown register: ${key}`);
    }

    const setMin = register.set_min;
    const setMax = register.set_max;

    if (!limitValueRaw && (value < setMin || value > setMax)) {
      throw new Error(`Value must be between ${setMin} and ${setMax}: ${value}`);
    }

    const formula = register.formula_inverse.replace(/#/g, value.toString()).replace(/Mod/g, '%');
    let evaluated = parser.evaluate(formula, {
      IF: (a: boolean, b: number, c: number) => (a ? b : c),
      int: (a: number) => Math.trunc(a)
    });

    evaluated = Math.trunc(evaluated);

    if (limitValueRaw && (evaluated < setMin || evaluated > setMax)) {
      throw new Error(`Raw value must be between ${setMin} and ${setMax}: ${evaluated}`);
    }

    if (register.is_hex) {
      evaluated = parseInt(evaluated.toString(), 16);
    }

    return evaluated;
  }

  async setRegisterValue(key: string, value: number, limitValueRaw = false): Promise<void> {
    const register = this.registerMap[key.toLowerCase()];
    if (!register) {
      throw new Error(`Unknown register: ${key}`);
    }

    const prepared = this.prepareValueForWriting(key, value, limitValueRaw);
    await this.client.writeDeviceValues(this.summary.idDevice, this.summary.idProduct, {
      items: [register.offset],
      masks: [register.mask],
      values: [prepared]
    });
  }

  async setRegisterValues(items: Record<string, number>, limitValueRaw = false): Promise<void> {
    const offsets: number[] = [];
    const masks: number[] = [];
    const values: number[] = [];

    for (const [key, value] of Object.entries(items)) {
      const register = this.registerMap[key.toLowerCase()];
      if (!register) {
        throw new Error(`Unknown register: ${key}`);
      }
      offsets.push(register.offset);
      masks.push(register.mask);
      values.push(this.prepareValueForWriting(key, value, limitValueRaw));
    }
    await this.client.writeDeviceValues(this.summary.idDevice, this.summary.idProduct, {
      items: offsets,
      masks,
      values
    });
  }

  async setRegisterValueDescription(
    key: string,
    valueDescription: string | number,
    valueFallback?: number,
    language?: string
  ): Promise<void> {
    const options = this.getRegisterValueOptions(key, language);
    const entries = Object.entries(options);
    const match = entries.find(([, description]) => description === valueDescription);
    let value: number | undefined = match ? Number(match[0]) : undefined;

    if (value === undefined) {
      const numeric = Number(valueDescription);
      value = Number.isNaN(numeric) ? valueFallback : numeric;
    }

    if (value === undefined) {
      throw new Error(`Unable to resolve value for ${key}`);
    }

    await this.setRegisterValue(key, value);
  }
}
