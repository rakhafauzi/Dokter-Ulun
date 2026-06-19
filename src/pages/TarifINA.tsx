
import React from 'react';
import { FileBarChart } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { InacbgTariffSimulationContent } from "@/components/modals/InacbgTariffSimulationDialog";

const TarifINA = () => {
  return (
    <div className="mx-auto w-full animate-fade-in space-y-6 rounded-md bg-white p-2 shadow-md transition-colors dark:bg-slate-950 dark:shadow-slate-950/40 md:space-y-8 md:p-6">
      <div className="flex items-center space-x-2 mb-6">
        <FileBarChart size={24} className="text-primary" />
        <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Tarif INA-CBGs</h1>
      </div>
      <Separator className="mb-6" />
      <InacbgTariffSimulationContent />
    </div>
  );
};

export default TarifINA;
