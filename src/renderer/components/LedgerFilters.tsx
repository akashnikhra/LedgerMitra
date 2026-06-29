import SearchableSelect from './SearchableSelect';

interface Props {
  customers: { id: number; name: string; }[];
  selectedCustomer: string;
  selectedYear: string;
  onCustomerChange: (v: string) => void;
  onYearChange: (v: string) => void;
  financialYears?: { id: number; name: string }[];
}

export default function LedgerFilters({ customers, selectedCustomer, selectedYear, onCustomerChange, onYearChange, financialYears }: Props) {
  return (
    <div className="panel-filters">
      <SearchableSelect
        options={[{ value: 0, label: 'All Customers' }, ...customers.map(c => ({ value: c.id, label: c.name }))]}
        value={selectedCustomer}
        onChange={(v) => onCustomerChange(String(v))}
        placeholder="All Customers"
      />
      <select className="input" value={selectedYear} onChange={e => onYearChange(e.target.value)}>
        <option value="">All years</option>
        {(financialYears || []).map(fy => <option key={fy.id} value={fy.id}>{fy.name}</option>)}
      </select>
    </div>
  );
}
