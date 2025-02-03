import { forwardRef, useCallback, useEffect, useRef, useState } from 'react';
import ReactAce, { IAceEditorProps } from 'react-ace/lib/ace';

import dynamic from 'next/dynamic';
import debounce from 'lodash/debounce';


import { useQueryParams } from '@/hooks/useQueryParams';

import QuerySidebar from './QuerySidebar/QuerySidebar';
import { HBox, align, VBox, Spinner, Tab } from './common';
import { ActionType, useAppContext } from './providers/AppProvider';

const AceEdit = dynamic(
  async () => {
    require('ace-builds/src-noconflict/ace');
    const ace = await import('./AceEditor');
    require('ace-builds/src-noconflict/ext-language_tools');
    require('ace-builds/src-noconflict/theme-monokai');
    require('ace-builds/src-noconflict/mode-pgsql');
    require('ace-builds/src-noconflict/theme-tomorrow');
    return ace;
  },
  { ssr: false },
);

const ForwardRefEditor = forwardRef((props: IAceEditorProps, ref: any) => (
  <AceEdit props={props} editorRef={ref} />
));
ForwardRefEditor.displayName = 'ForwardRefEditor';

export default function IasqlEditor() {
  const {
    dispatch,
    isDarkMode,
    selectedDb,
    functions,
    token,
    editorTabs,
    editorSelectedTab,
    forceRun,
  } = useAppContext();
  const editorRef = useRef(null as null | ReactAce);
  const prevTabsLenRef = useRef(null as null | number);
  const queryParams = useQueryParams();
  const [suggestions, setSuggestions] = useState([]);

  // Handlers
  const getInitialQuery = useCallback((sql: string | null) => {
    let initialQuery = editorTabs?.[editorSelectedTab]?.content ?? 'SELECT * FROM iasql_help();';
    if (sql && sql.length > 0) initialQuery = sql;
    return initialQuery;
  }, []);

  const handleEditorContentUpdate =  useCallback(
    (content: string, event:any) => {
      editorRef?.current?.editor.commands.on('afterExec', eventData => {handleAfterExec(eventData); });
      dispatch({ action: ActionType.EditContent, data: { content } });
    },
    [dispatch],
  );

  const handleQueryToRunUpdate = useCallback(
    (db: any, tabIdx: number) => {
      const contentToBeRun = editorRef?.current?.editor?.getSelectedText()
        ? editorRef?.current?.editor?.getSelectedText()
        : editorRef?.current?.editor?.getValue();
      if (token && contentToBeRun) {
        dispatch({
          token,
          action: ActionType.RunSql,
          data: {
            db,
            content: contentToBeRun,
            tabIdx,
          },
        });
      }
    },
    [dispatch, token],
  );

  const onTabChange = (i: number) => {
    dispatch({
      action: ActionType.EditorSelectTab,
      data: { index: i === editorTabs.length - 1 ? i - 1 : i },
    });
  };

  const onTabClose = (i: number) => {
    dispatch({
      action: ActionType.EditorCloseTab,
      data: { index: i },
    });
  };

  // Set up initial query in editor content
  useEffect(() => {
    handleEditorContentUpdate(getInitialQuery(queryParams.get('sql')), null);
  }, [getInitialQuery, handleEditorContentUpdate, queryParams]);

  // Set up command to enable Ctrl-Enter runs
  const command = {
    name: 'Run SQL',
    bindKey: { win: 'Ctrl-Enter', mac: 'Cmd-Enter' },
    exec: () => handleQueryToRunUpdate(selectedDb, editorSelectedTab),
  };

  useEffect(() => {
    if (editorTabs?.[editorSelectedTab]?.isRunning) {
      editorRef?.current?.editor?.commands?.removeCommand(command);
    } else {
      editorRef?.current?.editor?.commands?.removeCommand(command);
      editorRef?.current?.editor?.commands?.addCommand(command);
    }
  }, [editorTabs, editorSelectedTab, editorRef.current]);

  // Set up editor theme
  useEffect(() => {
    const root = document.documentElement;
    const observer = new MutationObserver(() => {
      const isDark = localStorage.getItem('theme') === 'dark';
      if (isDark && editorRef?.current?.editor?.getTheme() === 'ace/theme/tomorrow') {
        editorRef?.current?.editor?.setTheme('ace/theme/monokai');
      } else if (!isDark && editorRef?.current?.editor?.getTheme() === 'ace/theme/monokai') {
        editorRef?.current?.editor?.setTheme('ace/theme/tomorrow');
      }
    });
    observer.observe(root, { attributes: true });
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', event => {
      const isDark = event.matches;
      editorRef?.current?.editor?.setTheme(isDark ? 'ace/theme/monokai' : 'ace/theme/tomorrow');
    });
  }, []);

  const completer = {
    getCompletions: async function(editor: any, session: any, pos: any, prefix: any, callback: any) {
      console.log("in get completions");
      console.log(suggestions);
      if (suggestions) {
        callback(null, suggestions);
      }
      else callback(null, []);
    },
    insertSnippet: function(editor:any, data:any) {
      /*editor.forEachSelection(function() {
          editor.insert(data.caption)
      })*/
      console.log("in insert match");
      console.log(data);
    }
  }
  if (editorRef.current?.editor.completers) editorRef.current.editor.completers = [completer];

  useEffect(() => {
    if (editorTabs.length !== prevTabsLenRef.current) {
      dispatch({
        token,
        action: ActionType.EditorSelectTab,
        data: {
          index: editorTabs.length - 2 >= 0 ? editorTabs.length - 2 : 0,
          forceRun,
          editorTabs,
          selectedDb,
        },
      });
    }
  }, [editorTabs, dispatch, forceRun, selectedDb, token]);

  useEffect(() => {
    if (!prevTabsLenRef.current || prevTabsLenRef.current !== editorTabs.length) {
      prevTabsLenRef.current = editorTabs.length;
    }
  }, [editorTabs]);

  const handleAfterExec = debounce((eventData:any) => {
  
        if (eventData.command.name === 'insertstring') {
      
        console.log('User typed a character: ' + eventData.args);
        const content = editorRef?.current?.editor.session.getValue() ?? '';
        const pos = editorRef?.current?.editor.getCursorPosition();

        const line = editorRef?.current?.editor.session.getLine(pos!.row) ?? '';

        // retrieve also the 2 previous lines
        const linesToRetrieve = 3;
        const lines = content.split('\n');
        let selectedLines:any[] = [];
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].includes(line)) {
            const startIndex = Math.max(0, i - linesToRetrieve + 1);
            const endIndex = i + 1;
            selectedLines = lines.slice(startIndex, endIndex);
            break;
          }
        }
        const finalText = (selectedLines.length == 0) ? line:selectedLines.join('\n');
        if (finalText && finalText.length>3) {
          // having the final text, call the sqlpal autocomplete to get a completion
          const requestOptions = {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ conn_str: sessionStorage.getItem('connString'), query: finalText }),
            credentials: 'include' as RequestCredentials
          };
          const endpoint = process.env.AUTOCOMPLETE_ENDPOINT ?? 'http://localhost:5000/autocomplete';
          //const endpoint = "http://192.168.2.38:5000/autocomplete"
          fetch(endpoint, requestOptions)
          .then(response => response.json())
          .then(response => {
            if (response['output_text']) {
              // check if response is a valid sql query
              const sg = [{value: '\n'+response['output_text'], meta: 'custom', score: 1000}];
              setSuggestions(sg as []);
            }
          })
          .catch(error => console.error(error));          
        }
    }
}, 300);

useEffect(() => {
  if (suggestions.length > 0) {
    editorRef?.current?.editor.execCommand('startAutocomplete');
  }
}, [suggestions]);

  return (
    <VBox customClasses='mb-3'>
      <HBox alignment={align.between}>
        {!Object.keys(functions ?? {}).length ? <Spinner /> : <QuerySidebar />}
        <VBox id='tabs-and-editor' customClasses='w-full' height='h-50vh'>
          <Tab
            tabs={editorTabs}
            defaultIndex={editorSelectedTab}
            onChange={onTabChange}
            selectedIndex={editorSelectedTab}
            onTabClose={onTabClose}
            isLoading={editorTabs.some(t => t.isRunning)}
          ></Tab>
          <ForwardRefEditor
            ref={editorRef}
            // `dark:` selector is not working here, I guess it is not compatible with AceEditor component
            className='border-none'
            width='100%'
            height='100%'
            name='iasql-editor'
            value={editorTabs[editorSelectedTab].content}
            onChange={handleEditorContentUpdate}
            mode='pgsql'
            setOptions={{
              showPrintMargin: false,
              useWorker: false,
              enableBasicAutocompletion: true,
              enableLiveAutocompletion: true,
              enableSnippets: true,
              showLineNumbers: true,
              tabSize: 2,
              theme: isDarkMode ? 'ace/theme/monokai' : 'ace/theme/tomorrow',
            }}
          />
        </VBox>
      </HBox>
    </VBox>
  );
}
