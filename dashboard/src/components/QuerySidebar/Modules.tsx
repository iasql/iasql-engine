import { useState } from 'react';

import { align, Button, HBox, Input, VBox } from '../common';
import { ActionType, useAppContext } from '../providers/AppProvider';

export default function Modules({
  modulesInstalledData,
  allModules,
}: {
  modulesInstalledData: {
    [moduleName: string]: {
      [tableName: string]: { [columnName: string]: { dataType: string; isMandatory: boolean } };
    };
  };
  allModules: { [moduleName: string]: string[] };
}) {
  const { dispatch, token, selectedDb } = useAppContext();
  

  const installedModules = Object.keys(modulesInstalledData ?? {});
  const moduleList: any = {};
  for (const key in allModules) {
    if (['aws_account', 'iasql_functions', 'iasql_platform'].includes(key)) continue;
    moduleList[key] = {
      dependencies: allModules[key],
      installed: !!installedModules.find(mod => mod.indexOf(key) === 0),
    };
  }
  const [name, setName] = useState('');
  const [filteredMods, setFilteredMods] = useState(Object.keys(moduleList ?? {}));

  const filter = (e: any) => {
    const keyword = e.target.value;
    if (keyword !== '') {
      const results = Object.keys(moduleList ?? {}).filter(mod => {
        return mod.toLowerCase().indexOf(keyword.toLowerCase()) !== -1;
      });
      setFilteredMods(results);
    } else {
      setFilteredMods(Object.keys(moduleList ?? {}));
    }
  };

  const handleAction = (moduleName: string, install: boolean) => {
    dispatch({
      action: install ? ActionType.InstallModule : ActionType.UninstallModule,
      data: {
        moduleName,
      },
    });
  };

  return (
    <VBox alignment={align.start} id='modules-tab'>
      <HBox alignment={align.around} customStyles='p-2'>
        <Input
          name='module-search-input'
          type='search'
          value={name}
          setValue={setName}
          onChange={filter}
          placeholder='Search'
        />
      </HBox>
      <VBox alignment={align.start}>
        {filteredMods && filteredMods.length ? (
          Object.entries(moduleList ?? {})
            .filter(([mod, _]: [string, any]) => filteredMods.includes(mod))
            .map(([mod, val]: [string, any]) => (
              <HBox key={mod} alignment={align.between} customStyles='px-3 py-2 grid grid-cols-3 text-xs'>
                <span className='col-span-2 truncate' title={mod}>
                  {mod}
                </span>
                {!!val.installed ? (
                  <Button look='outline' color='tertiary' onClick={() => handleAction(mod, false)}>
                    Uninstall
                  </Button>
                ) : (
                  <Button look='outline' color='primary' onClick={() => handleAction(mod, true)}>
                    Install
                  </Button>
                )}
              </HBox>
            ))
        ) : (
          <HBox customStyles='p-2'>No modules found</HBox>
        )}
      </VBox>
    </VBox>
  );
}
