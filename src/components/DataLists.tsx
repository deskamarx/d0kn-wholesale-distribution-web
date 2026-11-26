import type { AppState } from "../types";

function unique(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).sort((a, b) =>
    a.localeCompare(b)
  );
}

/** Native autocomplete sources built from existing workspace records. */
export default function DataLists({ state }: { state: AppState }) {
  const suppliers = unique(state.suppliers.flatMap((item) => [item.name, item.chineseName]));
  const products = unique(state.products.flatMap((item) => [item.name, item.sku]));
  const customers = unique(state.customers.flatMap((item) => [item.company, item.contact]));
  const cities = unique([
    ...state.suppliers.map((item) => item.city),
    ...state.customers.map((item) => item.city),
    ...state.warehouses.map((item) => item.city),
  ]);
  const categories = unique(state.products.map((item) => item.category));
  const warehouses = unique(state.warehouses.flatMap((item) => [item.name, item.code]));
  const carriers = unique(state.shipments.map((item) => item.carrier));
  const originPorts = unique(state.shipments.map((item) => item.originPort));
  const destinationPorts = unique(state.shipments.map((item) => item.destinationPort));

  return (
    <div className="datalist-host" aria-hidden="true">
      <datalist id="d0kn-suppliers">
        {suppliers.map((value) => <option key={value} value={value} />)}
      </datalist>
      <datalist id="d0kn-products">
        {products.map((value) => <option key={value} value={value} />)}
      </datalist>
      <datalist id="d0kn-customers">
        {customers.map((value) => <option key={value} value={value} />)}
      </datalist>
      <datalist id="d0kn-cities">
        {cities.map((value) => <option key={value} value={value} />)}
      </datalist>
      <datalist id="d0kn-categories">
        {categories.map((value) => <option key={value} value={value} />)}
      </datalist>
      <datalist id="d0kn-warehouses">
        {warehouses.map((value) => <option key={value} value={value} />)}
      </datalist>
      <datalist id="d0kn-carriers">
        {carriers.map((value) => <option key={value} value={value} />)}
      </datalist>
      <datalist id="d0kn-origin-ports">
        {originPorts.map((value) => <option key={value} value={value} />)}
      </datalist>
      <datalist id="d0kn-destination-ports">
        {destinationPorts.map((value) => <option key={value} value={value} />)}
      </datalist>
    </div>
  );
}
