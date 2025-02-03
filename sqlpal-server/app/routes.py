from flask import Blueprint, Flask, abort,  jsonify, make_response, request, session
from flask_cors import CORS, cross_origin
from langchain.embeddings.openai import OpenAIEmbeddings
from langchain.vectorstores.faiss import FAISS
from dotenv import load_dotenv
import os
import openai
import promptlayer
from sqlalchemy.orm import Session
from sqlalchemy.ext.declarative import declarative_base

from .utils import FaissContent, autocomplete_query, connect_to_db, read_index
import logging

logger = logging.getLogger(__name__)

api_bp = Blueprint('api_bp', __name__)
app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "http://localhost:9876", "supports_credentials": True}})
app.config['CORS_HEADERS'] = 'Content-Type'

load_dotenv()
openai.api_key = os.environ.get('OPENAI_API_KEY')    
promptlayer.api_key = os.environ.get('PROMPTLAYER_API_KEY')

@api_bp.route('/discover', methods=['OPTIONS', 'POST'])
@cross_origin(origin='http://localhost:9876', supports_credentials=True)
def discover():
    if request.method == 'OPTIONS':
        return make_response(jsonify({}), 200)

    db, error = connect_to_db(request)
    if error:
       return error
    
    docsearch = read_index(db)
    tables = db.get_usable_table_names()
    texts = []
    for table in tables:
        info = db.get_table_info(table_names=[table])
        texts.append(info)

    # add to a vector search using embeddings
    embeddings = OpenAIEmbeddings()  
    if docsearch is None:
      docsearch = FAISS.from_texts(texts, embeddings)
    else:
      docsearch.add_texts(texts)
    
    filename = f"index_{session.sid}"
    filepath = os.path.join(os.environ.get('INDEX_FOLDER'), filename+'.pkl')
    docsearch.save_local(os.environ.get('INDEX_FOLDER'), filename)
    if os.environ.get('USE_DATABASE'):

      try:
        with open(filepath, 'rb') as f:
          content = f.read()
      except Exception as e:
         logger.exception(e)

      if content is not None:
        sess = Session(bind=db._engine)
        new_file = FaissContent(session_id=session.sid, content=content)
        sess.add(new_file)
        sess.commit()

    response = jsonify({"status":'OK'})
    return response           

@api_bp.route('/autocomplete', methods=['OPTIONS', 'POST'])
@cross_origin(origin='http://localhost:9876', supports_credentials=True)
def autocomplete():
    if request.method == 'OPTIONS':
        return make_response(jsonify({}), 200)

    db, error = connect_to_db(request)
    if error:
       return error

    docsearch = read_index(db)  
    if docsearch is not None:        
      query = request.json.get('query', None)
      if query:
          # execute query autocompletion
          result = autocomplete_query(query, docsearch)
          response = jsonify({'output_text': result})
          return response
      else:
        return make_response(jsonify({'error': 'No query provided'}), 400)
    else:
        return make_response(jsonify({'error': 'Error retrieving index'}), 500)

@cross_origin(origin='http://localhost:9876', supports_credentials=True)
@api_bp.route('/add', methods=['OPTIONS', 'POST'])
def add():
    if request.method == 'OPTIONS':
        return make_response(jsonify({}), 200)

    db, error = connect_to_db(request)
    if error:
       return error

    docsearch = read_index(db)
    if docsearch is not None:    
      query = request.json.get('query', None)
      if query:
          docsearch.add_texts([query])
          response = jsonify({"status":'OK'})
          return response
      else:
          return make_response(jsonify({'error': 'No query provided'}), 400)
    else:
      return make_response(jsonify({'error': 'Cannot query without docsearch base'}), 500)