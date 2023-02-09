/**
 * Creating a sidebar enables you to:
 - create an ordered group of docs
 - render a sidebar for each doc of that group
 - provide next/previous navigation

 The sidebars can be generated from the filesystem, or explicitly defined here.

 Create as many sidebars as you want.
 */
async function getDocsLinks() {
  // read all documents at directory
  var fs = require('fs');
  var path = require('path');
  var filesPath = path.join(__dirname, 'docs', 'reference', 'modules');

  // please note: links are pointing to /docs/reference, without versioning
  // as the path has changed, links are not correctly resolving for `next` version
  let files = await fs.readdirSync(filesPath);
  let items = [];
  const excluded = [
    'iasql_functions_iasql.md',
    'index.md',
    'interfaces.md',
    'subscribers.md',
    'aws_lambda_aws.md',
    'iasql_functions.md',
  ];

  // add global
  items.push({
    type: 'doc',
    label: 'Index',
    id: 'reference/index',
    customProps: {
      fragment: '',
      label: 'Index',
    },
  });

  // sort it
  filters = files.filter(item => !excluded.includes(item));
  filters.unshift('iasql_functions');

  for (const file of filters) {
    // just strip md
    const name = file.split('.')[0];
    items.push({
      type: 'doc',
      label: name,
      id: 'reference/modules/' + name,
      customProps: {
        label: name,
      },
    });
  }
  return items;
}

module.exports = (async function () {
  // By default, Docusaurus generates a sidebar from the docs folder structure
  const items = await getDocsLinks();
  return {
    docs: [
      'getting-started',
      {
        type: 'category',
        label: 'How-to guides',
        collapsible: true,
        collapsed: true,
        items: [
          {
            type: 'autogenerated',
            dirName: 'how-to',
          },
        ],
      },
      {
        type: 'category',
        label: 'Concepts',
        collapsible: true,
        collapsed: true,
        items: [
          {
            type: 'autogenerated',
            dirName: 'concepts',
          },
        ],
      },
      {
        type: 'category',
        label: 'Modules',
        collapsible: true,
        collapsed: true,
        items: items,
      },
    ],
  };
})();
