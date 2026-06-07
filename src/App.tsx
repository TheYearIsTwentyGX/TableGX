import { useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { TabbedTable } from './components/table';
import type { TableColumnMeta, TabbedTableTab } from './components/table';
import { LIQUID_GLASS_THEME, BRUTALIST_THEME } from './components/table/themes';

type Facility = {
  id: string;
  name: string;
  dba: string;
  beds: number;
  isActive: boolean;
  city: string;
  state: string;
  revenue: number;
  manager: string;
  phone: string;
  email: string;
  rating: number;
  zipCode: string;
  address: string;
  website: string;
  fax: string;
  director: string;
  capacity: number;
  occupancy: number;
  lastInspection: string;
  complianceScore: number;
  yearBuilt: number;
  children?: Facility[];
};

const defaultData: Facility[] = [
  { id: '1', name: 'General Hospital', dba: 'GenH', beds: 250, isActive: true, city: 'NYC', state: 'NY', revenue: 1000000, manager: 'John Doe', phone: '555-0100', email: 'john@genh.com', rating: 5, zipCode: '10001', address: '123 Main St', website: 'genh.com', fax: '555-0200', director: 'Dr. Smith', capacity: 300, occupancy: 85, lastInspection: '2025-01-10', complianceScore: 98, yearBuilt: 1980 },
  { id: '2', name: 'City Clinic', dba: 'CC', beds: 50, isActive: true, city: 'LA', state: 'CA', revenue: 500000, manager: 'Jane Smith', phone: '555-0101', email: 'jane@cc.com', rating: 4, zipCode: '90001', address: '456 Oak St', website: 'cc.com', fax: '555-0201', director: 'Dr. Jones', capacity: 60, occupancy: 90, lastInspection: '2025-02-15', complianceScore: 95, yearBuilt: 2005 },
  {
    id: '3', name: 'Regional Medical Center', dba: 'RMC', beds: 500, isActive: false, city: 'Chicago', state: 'IL', revenue: 2000000, manager: 'Bob Brown', phone: '555-0102', email: 'bob@rmc.com', rating: 3, zipCode: '60601', address: '789 Pine St', website: 'rmc.com', fax: '555-0202', director: 'Dr. Brown', capacity: 550, occupancy: 70, lastInspection: '2024-11-20', complianceScore: 88, yearBuilt: 1975,
    children: [
      { id: '3-1', name: 'RMC - North Wing', dba: 'RMC-N', beds: 200, isActive: false, city: 'Chicago', state: 'IL', revenue: 800000, manager: 'Alice White', phone: '555-0103', email: 'alice@rmc.com', rating: 4, zipCode: '60602', address: '789 Pine St N', website: 'rmc.com/n', fax: '555-0203', director: 'Dr. White', capacity: 220, occupancy: 60, lastInspection: '2024-11-21', complianceScore: 90, yearBuilt: 1978 },
      { id: '3-2', name: 'RMC - South Wing', dba: 'RMC-S', beds: 300, isActive: true, city: 'Chicago', state: 'IL', revenue: 1200000, manager: 'Charlie Green', phone: '555-0104', email: 'charlie@rmc.com', rating: 4, zipCode: '60603', address: '789 Pine St S', website: 'rmc.com/s', fax: '555-0204', director: 'Dr. Green', capacity: 330, occupancy: 80, lastInspection: '2024-11-22', complianceScore: 92, yearBuilt: 1982 },
    ]
  },
  { id: '4', name: 'Childrens Hospital', dba: 'CH', beds: 150, isActive: true, city: 'Austin', state: 'TX', revenue: 1500000, manager: 'Eve Black', phone: '555-0105', email: 'eve@ch.com', rating: 5, zipCode: '73301', address: '101 Kids Way', website: 'ch.com', fax: '555-0205', director: 'Dr. Black', capacity: 160, occupancy: 95, lastInspection: '2025-03-01', complianceScore: 99, yearBuilt: 2010 },
  { id: '5', name: 'Veterans Hospital', dba: 'VH', beds: 120, isActive: true, city: 'Miami', state: 'FL', revenue: 900000, manager: 'Frank Blue', phone: '555-0106', email: 'frank@vh.com', rating: 4, zipCode: '33101', address: '202 Vet Blvd', website: 'vh.com', fax: '555-0206', director: 'Dr. Blue', capacity: 140, occupancy: 80, lastInspection: '2025-01-05', complianceScore: 94, yearBuilt: 1960 },
];

// Generate massive data
const mockData: Facility[] = Array.from({ length: 1000 }, (_, i) => ({
  id: `mock-${i}`,
  name: `Facility ${i}`,
  dba: `DBA ${i}`,
  beds: Math.floor(Math.random() * 500) + 50,
  isActive: Math.random() > 0.5,
  city: `City ${Math.floor(i / 10)}`,
  state: ['CA', 'NY', 'TX', 'FL', 'IL'][Math.floor(Math.random() * 5)],
  revenue: Math.floor(Math.random() * 1000000),
  manager: `Manager ${i}`,
  phone: `555-01${Math.floor(Math.random() * 99)}`,
  email: `contact${i}@example.com`,
  rating: Math.floor(Math.random() * 5) + 1,
  zipCode: `1234${Math.floor(Math.random() * 9)}`,
  address: `${Math.floor(Math.random() * 9999)} Main St`,
  website: `hospital${i}.com`,
  fax: `555-02${Math.floor(Math.random() * 99)}`,
  director: `Director ${i}`,
  capacity: Math.floor(Math.random() * 500) + 50,
  occupancy: Math.floor(Math.random() * 100),
  lastInspection: `202${Math.floor(Math.random() * 5)}-0${Math.floor(Math.random() * 9) + 1}-15`,
  complianceScore: Math.floor(Math.random() * 20) + 80,
  yearBuilt: 1950 + Math.floor(Math.random() * 70)
}));

export default function App() {
  const [data, setData] = useState<Facility[]>([...defaultData, ...mockData]);
  const [activeTheme, setActiveTheme] = useState<'default' | 'glass' | 'brutalist'>('default');
  const [isDarkMode, setIsDarkMode] = useState(false);

  const columns: ColumnDef<Facility>[] = [
    {
      id: 'name',
      header: 'Company Name',
      accessorKey: 'name',
      meta: { footerLabel: 'Totals' } as TableColumnMeta<Facility>
    },
    {
      id: 'dba',
      header: 'DBA',
      accessorKey: 'dba',
      meta: { editable: true, inputType: 'text', maxColumnWidth: 300 } as TableColumnMeta<Facility>
    },
    {
      id: 'beds',
      header: 'Beds',
      accessorKey: 'beds',
      meta: { editable: true, inputType: 'number', footerAggregate: 'sum' } as TableColumnMeta<Facility>
    },
    {
      id: 'isActive',
      header: 'Active',
      accessorKey: 'isActive',
      meta: { editable: true, inputType: 'boolean', footerAggregate: 'count' } as TableColumnMeta<Facility>
    },
    {
      id: 'city',
      header: 'City',
      accessorKey: 'city',
      meta: { editable: true, inputType: 'text' } as TableColumnMeta<Facility>
    },
    {
      id: 'state',
      header: 'State',
      accessorKey: 'state',
      meta: { editable: true, inputType: 'text' } as TableColumnMeta<Facility>
    },
    {
      id: 'revenue',
      header: 'Revenue',
      accessorKey: 'revenue',
      meta: { editable: true, inputType: 'number', footerAggregate: 'sum' } as TableColumnMeta<Facility>
    },
    {
      id: 'actions',
      header: 'Actions',
      enableSorting: false,
      enableColumnFilter: false,
      meta: {
        fixedMeasureWidth: 120,
        actions: [
          {
            id: 'view',
            label: 'View',
            onClick: (row) => alert(`Viewing ${row.name}`)
          },
          {
            id: 'delete',
            label: 'Delete',
            variant: 'destructive',
            confirm: { title: 'Delete facility?', confirmLabel: 'Delete' },
            isDisabled: (row) => row.isActive === true,
            onClick: async (row) => { alert(`Deleted ${row.name}`); }
          },
        ],
      } as TableColumnMeta<Facility>
    },
  ];

  const handleSaveEdit = async (row: Facility, colId: string, val: string | number | boolean) => {
    console.log('Saved', row.id, colId, val);
    
    // Quick recursive update helper for the demo
    const updateRecursive = (items: Facility[]): Facility[] => {
      return items.map(item => {
        if (item.id === row.id) {
          return { ...item, [colId]: val };
        }
        if (item.children) {
          return { ...item, children: updateRecursive(item.children) };
        }
        return item;
      });
    };

    setData(prev => updateRecursive(prev));
    return true;
  };

  const commonColumns = columns.slice(0, 2); // DBA and Beds

  const tab1Columns = [
    ...commonColumns,
    columns.find(c => c.id === 'isActive')!,
    columns.find(c => c.id === 'city')!,
    columns.find(c => c.id === 'state')!,
    columns.find(c => c.id === 'revenue')!,
    { header: 'Capacity', accessorKey: 'capacity', id: 'capacity', meta: { editable: true } },
    { header: 'Occupancy %', accessorKey: 'occupancy', id: 'occupancy', meta: { editable: true } },
    { header: 'Compliance Score', accessorKey: 'complianceScore', id: 'complianceScore' }
  ] as ColumnDef<Facility>[];

  const tab2Columns = [
    ...commonColumns,
    { header: 'Manager', accessorKey: 'manager', id: 'manager', meta: { editable: true } },
    { header: 'Director', accessorKey: 'director', id: 'director', meta: { editable: true } },
    { header: 'Phone Number', accessorKey: 'phone', id: 'phone', meta: { editable: true } },
    { header: 'Email Address', accessorKey: 'email', id: 'email', meta: { editable: true } },
    { header: 'Fax Number', accessorKey: 'fax', id: 'fax' },
    { header: 'Website', accessorKey: 'website', id: 'website' },
    { header: 'Star Rating', accessorKey: 'rating', id: 'rating', meta: { editable: true } }
  ] as ColumnDef<Facility>[];

  const tab3Columns = [
    ...commonColumns,
    { header: 'Zip Code', accessorKey: 'zipCode', id: 'zipCode' },
    columns.find(c => c.id === 'city')!,
    { header: 'Address', accessorKey: 'address', id: 'address' },
    { header: 'Manager', accessorKey: 'manager', id: 'manager' },
    { header: 'Phone Number', accessorKey: 'phone', id: 'phone' },
    { header: 'Year Built', accessorKey: 'yearBuilt', id: 'yearBuilt' },
    { header: 'Last Inspection', accessorKey: 'lastInspection', id: 'lastInspection' }
  ] as ColumnDef<Facility>[];

  const tabs: TabbedTableTab<Facility>[] = [
    {
      id: 'all',
      label: 'Financial View (Editable)',
      editable: true,
      columns: tab1Columns,
      frozenColumns: 2,
      editableColumnIds: ['dba', 'beds', 'isActive', 'city', 'state', 'revenue'],
      singleClickEdit: false,
      onSaveEdit: handleSaveEdit,
    },
    {
      id: 'single-click',
      label: 'Contact Info (Fast Edit)',
      editable: true,
      columns: tab2Columns,
      frozenColumns: 2,
      editableColumnIds: ['dba', 'beds', 'manager', 'phone', 'email', 'rating'],
      singleClickEdit: true,
      onSaveEdit: handleSaveEdit,
    },
    {
      id: 'read-only',
      label: 'Location Directory',
      editable: false,
      columns: tab3Columns,
      frozenColumns: 2,
    }
  ];

  const themeBgMap = {
    default: isDarkMode ? 'bg-gray-900' : 'bg-gray-100',
    glass: isDarkMode ? 'bg-gradient-to-br from-gray-900 via-indigo-950 to-black' : 'bg-gradient-to-br from-fuchsia-600 via-violet-600 to-cyan-500',
    brutalist: isDarkMode ? 'bg-[#1a1a1a] border-[16px] border-[#00ff00]' : 'bg-[#ffffff] border-[16px] border-black'
  };

  const themeTextMap = {
    default: isDarkMode ? 'text-white' : 'text-gray-900',
    glass: 'text-white',
    brutalist: isDarkMode ? 'text-[#00ff00] font-black uppercase tracking-tighter' : 'text-black font-black uppercase tracking-tighter'
  };

  const themeSubtextMap = {
    default: isDarkMode ? 'text-gray-400' : 'text-gray-500',
    glass: 'text-white/80',
    brutalist: isDarkMode ? 'text-[#00ff00] font-mono font-bold' : 'text-black font-mono font-bold'
  };

  return (
    <div className={`w-full h-screen p-8 flex flex-col transition-colors duration-500 ${isDarkMode ? 'dark' : ''} ${themeBgMap[activeTheme]}`}>
      <div className="mb-6 flex justify-between items-end">
        <div>
          <h1 className={`text-2xl font-bold ${themeTextMap[activeTheme]}`}>Facilities Manager</h1>
          <p className={`text-sm ${themeSubtextMap[activeTheme]}`}>Demoing Virtualization, Resizing, Nested Rows, Tabs, and Inline Editing</p>
        </div>
        
        {/* Theme & Dark Mode Toggles */}
        <div className="flex gap-4 items-center">
          <label className={`flex items-center gap-2 cursor-pointer ${themeTextMap[activeTheme]} text-sm font-semibold mr-2`}>
            <input 
              type="checkbox" 
              checked={isDarkMode} 
              onChange={e => setIsDarkMode(e.target.checked)}
              className="w-4 h-4 cursor-pointer"
            />
            Dark Mode
          </label>
          <div className={`flex rounded-lg overflow-hidden border-2 ${activeTheme === 'glass' ? 'border-white/40 shadow-lg' : activeTheme === 'brutalist' ? (isDarkMode ? 'border-[#00ff00] border-4 shadow-[4px_4px_0px_0px_rgba(0,255,0,1)]' : 'border-black border-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]') : (isDarkMode ? 'border-gray-700' : 'border-gray-200')}`}>
            {(['default', 'glass', 'brutalist'] as const).map(theme => (
              <button
                key={theme}
                onClick={() => setActiveTheme(theme)}
                className={`px-4 py-2 text-sm font-semibold capitalize transition-all
                  ${activeTheme === theme 
                    ? activeTheme === 'glass' ? (isDarkMode ? 'bg-black/40 backdrop-blur text-white' : 'bg-white/30 backdrop-blur text-white') : activeTheme === 'brutalist' ? (isDarkMode ? 'bg-[#00ff00] text-black font-black' : 'bg-black text-white font-black') : 'bg-table-accent text-white'
                    : activeTheme === 'glass' ? 'bg-white/10 text-white/70 hover:bg-white/20' : activeTheme === 'brutalist' ? (isDarkMode ? 'bg-[#1a1a1a] text-[#00ff00] border-r-4 border-[#00ff00] last:border-r-0 hover:bg-black' : 'bg-white text-black border-r-4 border-black last:border-r-0 hover:bg-[#ffeb3b]') : (isDarkMode ? 'bg-gray-800 text-gray-300 hover:bg-gray-700' : 'bg-white text-gray-600 hover:bg-gray-50')
                  }
                `}
              >
                {theme}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className={`flex-1 overflow-hidden flex flex-col ${activeTheme === 'default' ? 'bg-white shadow-xl rounded-lg border border-gray-200' : ''}`}>
        <TabbedTable<Facility>
          data={data}
          tabs={tabs}
          enableExpanding={true}
          getSubRows={(row: Facility) => row.children}
          getRowId={(row: Facility) => row.id}
          animateScrollOnly={true}
          classNames={activeTheme === 'glass' ? LIQUID_GLASS_THEME : activeTheme === 'brutalist' ? BRUTALIST_THEME : undefined}
        />
      </div>
    </div>
  );
}
