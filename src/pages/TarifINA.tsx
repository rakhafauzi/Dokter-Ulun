
import React from 'react';
import { FileBarChart } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { InacbgTariffSimulationContent } from "@/components/modals/InacbgTariffSimulationDialog";

const TarifINA = () => {
  return (
    <div className="p-2 md:p-6 space-y-6 md:space-y-8 w-full mx-auto animate-fade-in shadow-md bg-white rounded-md">
      <div className="flex items-center space-x-2 mb-6">
        <FileBarChart size={24} className="text-primary" />
        <h1 className="text-2xl font-bold text-gray-800">Tarif INA-CBGs</h1>
      </div>
      <Separator className="mb-6" />
      <InacbgTariffSimulationContent />
    </div>
  );
};

export default TarifINA;
