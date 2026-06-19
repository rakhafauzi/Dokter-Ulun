
import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Calendar } from 'lucide-react';
import { useTheme } from 'next-themes';

interface VisitChartProps {
  title: string;
  date: string;
  data?: Array<{ name: string; value: number }>;
}

const VisitChart: React.FC<VisitChartProps> = ({ title, date, data = [] }) => {
  // Use provided data or empty array if no data available
  const { resolvedTheme } = useTheme();
  const isDarkMode = resolvedTheme === 'dark';
  const chartData = data.length > 0 ? data : [];
  return (
    <div className="overflow-hidden rounded-xl bg-white shadow-md transition-shadow duration-300 hover:shadow-lg dark:bg-slate-900 dark:shadow-slate-950/40">
      <div className="p-6">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold uppercase text-slate-800 dark:text-slate-100">{title}</h2>
          <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
            <Calendar size={16} />
            <span className="text-sm">{date}</span>
          </div>
        </div>
        <div className="mt-6">
          <div className="h-[400px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartData}
                margin={{ top: 5, right: 30, left: 20, bottom: 100 }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={isDarkMode ? '#334155' : '#f3f4f6'} />
                <XAxis 
                  dataKey="name" 
                  angle={-90} 
                  textAnchor="end" 
                  height={100} 
                  tick={{ fontSize: 10, fill: isDarkMode ? '#94a3b8' : '#6b7280' }}
                  tickLine={false}
                  axisLine={{ stroke: isDarkMode ? '#475569' : '#e5e7eb' }}
                />
                <YAxis 
                  tick={{ fontSize: 12, fill: isDarkMode ? '#94a3b8' : '#6b7280' }}
                  tickLine={false}
                  axisLine={{ stroke: isDarkMode ? '#475569' : '#e5e7eb' }}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: isDarkMode ? '#0f172a' : '#fff', 
                    border: `1px solid ${isDarkMode ? '#334155' : '#e5e7eb'}`,
                    borderRadius: '0.5rem',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                    color: isDarkMode ? '#f8fafc' : '#0f172a'
                  }}
                />
                <Bar 
                  dataKey="value" 
                  fill="#4CAF50" 
                  barSize={20} 
                  radius={[4, 4, 0, 0]}
                  animationDuration={1500}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="mt-6 flex justify-center">
          <div className="inline-flex items-center rounded-full bg-slate-100 px-4 py-2 text-sm text-slate-700 dark:bg-slate-800 dark:text-slate-200">
            <span className="w-3 h-3 rounded-full bg-primary mr-2"></span>
            Poliklinik dan Rawat Jalan
          </div>
        </div>
      </div>
    </div>
  );
};

export default VisitChart;
