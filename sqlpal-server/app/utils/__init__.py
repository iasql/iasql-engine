import logging
import os
import re
from flask import current_app, jsonify, make_response, session
from langchain.tools.sql_database.tool import QuerySQLDataBaseTool
from langchain.chains.question_answering import load_qa_chain
from langchain.chains.chat_vector_db.prompts import QA_PROMPT
from langchain.chat_models import ChatOpenAI
from langchain import FAISS, SQLDatabase
from sqlalchemy import Column, Integer, LargeBinary, String
from sqlalchemy.ext.declarative import declarative_base
from langchain.embeddings.openai import OpenAIEmbeddings
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

CUSTOM_TEMPLATE = """
You are an smart SQL assistant, capable of autocompleting SQL queries. You should autocomplete any queries with the specific guidelines:
- write a syntactically correct query using {dialect}
- unless the user specifies in his question a specific number of examples he wishes to obtain, do not limit the results. You can order the results by a relevant column to return the most interesting examples in the database.
- never query for all the columns from a specific table, only ask for a the few relevant columns given the question.
- pay attention to use only table names, columns and indexes that you can see in the schema description. Be careful to not query for columns that do not exist. Also, pay attention to which column is in which table and the data type of the columns.
- try to use SELECT, INSERT, UPDATE or DELETE operations depending on the desired action. Use JOIN or subselects to query information from different tables.
- do not give errors on best practices such as avoiding SELECT *.
- use comments on the query to try to figure out what the user is asking for, but do not reject the autocomplete if the comments are not perfect.
- remember it is an autocomplete, always prepend the fragment of the query to the generated output.

Example:

<<<
# generate a list of buckets in my region
SELECT i
>>>

Output: SELECT index, name FROM bucket WHERE region = 'us-east-1';

Please continue the query with the following input:

<<<
{input}
>>>

Output:
"""

def autocomplete_query(query, docsearch):
    llm = ChatOpenAI(temperature=0.9, model_name='gpt-3.5-turbo')
    
    chain = load_qa_chain(llm, chain_type="stuff", prompt=QA_PROMPT)    
    docs = docsearch.similarity_search(query)    
    query_str = CUSTOM_TEMPLATE.format(dialect="Postgres", input=query)

    res = chain(
        {"input_documents": docs, "question": query_str}, return_only_outputs=True
    )
    queries = re.split('; *\n', res["output_text"])
    final_query = queries[-1]
    if (final_query.startswith("SELECT") or final_query.startswith("INSERT") or final_query.startswith("UPDATE") or final_query.startswith("DELETE")):
        return final_query

    return None

Base = declarative_base()
class FaissContent(Base):
    __tablename__ = 'faiss_content'
    id = Column(Integer, primary_key=True)
    session_id = Column(String)
    content = Column(LargeBinary)

def connect_to_db(request):
  conn_str = request.json.get('conn_str', None)
  # try to fix the postgres endpoint deprecation
  if conn_str:
    if conn_str.startswith("postgres://"):
      conn_str = conn_str.replace("postgres://", "postgresql://", 1)    
      session['conn_str'] = conn_str

    try:
        # connect and create all tables
        db = SQLDatabase.from_uri(conn_str, sample_rows_in_table_info=current_app.config.get('SAMPLE_ROWS_IN_TABLE_INFO'), indexes_in_table_info=True)

        if os.environ.get('USE_DATABASE'):
            Base.metadata.create_all(db._engine)

        return db, None
    except Exception as e:
      logger.exception(e)
      return None, make_response(jsonify({'error': 'Could not connect to database'}), 500)
  else:
    return None, make_response(jsonify({'error': 'No connection string provided'}), 400)  

def read_index(db):
  filename = f"index_{session.sid}"

  content = None
  if os.environ.get('USE_DATABASE'):
    try:
      sess = Session(bind=db._engine)
      row = sess.query(FaissContent).filter_by(session_id=session.sid).first()
      if row:
         content = row.content
    except Exception as e:
       logger.exception(e)

    if content is not None:
      # write to local file
      filepath = os.path.join(os.environ.get('INDEX_FOLDER'), filename)
      with open(filepath, 'wb') as f:
        f.write(content)

  # now read as usual from a file
  try:
    embeddings = OpenAIEmbeddings()  
    docsearch = FAISS.load_local(os.environ.get('INDEX_FOLDER'), embeddings, filename)
  except:
    docsearch = None

  return docsearch
