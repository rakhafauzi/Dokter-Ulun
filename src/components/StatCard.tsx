
import React from 'react';
import { cn } from '@/lib/utils';

interface StatCardProps {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  color: 'red' | 'blue' | 'green' | 'orange';
}

const StatCard: React.FC<StatCardProps> = ({ title, value, icon, color }) => {
  const colorMap = {
    red: 'bg-gradient-to-r from-card-red to-card-red/80',
    blue: 'bg-gradient-to-r from-card-blue to-card-blue/80',
    green: 'bg-gradient-to-r from-card-green to-card-green/80',
    orange: 'bg-gradient-to-r from-card-orange to-card-orange/80',
  };

  return (
    <div className="overflow-hidden rounded-xl bg-white shadow-md transition-transform transition-shadow duration-300 hover:scale-[1.02] hover:shadow-lg dark:bg-slate-900 dark:shadow-slate-950/40">
      <div className="flex items-center">
        <div className={cn("p-6 flex items-center justify-center rounded-lg mx-2", colorMap[color])}>
          <div className="bg-white/20 p-3 rounded-lg">
            {icon}
          </div>
        </div>
        <div className="p-6 flex-1">
          <div className="mb-1 text-sm font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">{title}</div>
          <div className="text-2xl font-bold text-slate-900 dark:text-slate-50">{value}</div>
        </div>
      </div>
    </div>
  );
};

export default StatCard;
