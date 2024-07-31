// Adds an entry to the event log on the page, optionally applying a specified
// CSS class.


let currentTransport, streamNumber, currentTransportDatagramWriter ;
let fghex = "9942029c06af74dbfd87d84d85404f1b53806670b5a637a287aa21135bb09e54";
let fingerprint = [];
let bidiStreamCount = 0;
for (let c = 0; c < fghex.length - 1; c += 2) {
  fingerprint.push(parseInt(fghex.substring(c, c + 2), 16));
}




var globalBidiStream;
// "Connect" button handler.
async function connect() {
  var transport ;
  generateRandomString();
  randomString = generateRandomString(10);
  const url = document.getElementById('url').value;
  try {
    transport = new WebTransport(url,{
      serverCertificateHashes: [
        {
          algorithm: 'sha-256',
          value: new Uint8Array(fingerprint)
        }
      ]
    });
    addToEventLog('Initiating connection...');
  } catch (e) {
    addToEventLog('Failed to create connection object. ' + e, 'error');
    return;
  }
  console.log(transport);

  
  try {
    await transport.ready;
    addToEventLog('Connection ready.');
  } catch (e) {
    addToEventLog('Connection failed. ' + e, 'error');
    return;
  }

  transport.closed
    .then(() => {
      addToEventLog('Connection closed normally.');
    })
    .catch(() => {
      addToEventLog('Connection closed abruptly.', 'error');
    });

  currentTransport = transport;
  streamNumber = 1;
  try {
    currentTransportDatagramWriter = transport.datagrams.writable.getWriter();
    addToEventLog('Datagram writer ready.');
  } catch (e) {
    addToEventLog('Sending datagrams not supported: ' + e, 'error');
    return;
  }
  //let stream = await transport.createBidirectionalStream();
  //globalBidiStream = stream
  readDatagrams(transport);
  acceptUnidirectionalStreams(transport);
  //acceptBidirectionalStreams(transport, stream);
  document.forms.sending.elements.send.disabled = false;
  document.getElementById('connect').disabled = true;
}



// "Send data" button handler.
async function sendData() {
  let form = document.forms.sending.elements;
  let encoder = new TextEncoder('utf-8');

  generateRandomString();

  let rawData = sending.data.value;
  let data = encoder.encode(rawData);
  let transport = currentTransport;
  let stream = await transport.createBidirectionalStream();
  globalBidiStream = stream
  acceptBidirectionalStreams(transport, stream);
  try {
    switch (form.sendtype.value) {
      case 'datagram':{
        await currentTransportDatagramWriter.write(data);
        addToEventLog('Sent datagram: ' + rawData);
        // let value_encoded = new TextDecoder().decode(value);
        // addToEventLog('Echo Received datagram: ' + value_encoded);
        break;
      }
      case 'unidi': {
        let stream = await transport.createUnidirectionalStream();
        let writer = stream.getWriter();
        await writer.write(data);
        await writer.close();
        addToEventLog('Sent a unidirectional stream with data: ' + rawData);
        break;
      }
      case 'bidi': {
        let stream = globalBidiStream;//await transport.createBidirectionalStream();
        let number = streamNumber++;
        // readFromIncomingStream(stream, number);

        let writer = stream.writable.getWriter();
        await writer.write(data);
        await writer.close();
        addToEventLog(
          'Opened bidirectional stream #' + number +
          ' with data: ' + rawData);
        break;
      }
    }
  } catch (e) {
    addToEventLog('Error while sending data: ' + e, 'error');
  }
}

// Reads datagrams from |transport| into the event log until EOF is reached.
async function readDatagrams(transport) {
  try {
    var datagram_reader = transport.datagrams.readable.getReader();
    addToEventLog('Datagram reader ready.');
  } catch (e) {
    addToEventLog('Receiving datagrams not supported: ' + e, 'error');
    return;
  }
  let decoder = new TextDecoder('utf-8');
  try {
    while (true) {
      const { value, done } = await datagram_reader.read();
      if (done) {
        addToEventLog('Done reading datagrams!');
        return;
      }
      let data = decoder.decode(value);
      addToEventLog('Echo Datagram received: ' + data);
    }
  } catch (e) {
    addToEventLog('Error while reading datagrams: ' + e, 'error');
  }
}

async function acceptUnidirectionalStreams(transport) {
  addToEventLog('Waiting for incoming unidirectional streams...');
  let reader = transport.incomingUnidirectionalStreams.getReader();
  try {
    while (true) {
      const { value, done } = await reader.read();

      if (done) {
        addToEventLog('Done accepting unidirectional streams!');
        return;
      }
      let stream = value; // ReadableStream
      let number = streamNumber++; // stream_id
      readFromIncomingStream(stream, number);
    }
  } catch (e) {
    addToEventLog('Error while accepting streams: ' + e, 'error');
  }
}

async function acceptBidirectionalStreams(transport, bidiStream) {
  addToEventLog('Waiting for incoming bidirectional streams...');
  let decoder = new TextDecoderStream('utf-8');
  let reader = bidiStream.readable.pipeThrough(decoder).getReader();  
  let data = "";
  
  try {
    while (true) {
      const { value, done } = await reader.read();

      if (done) {
        bidiStreamCount++;
        addToEventLog('Recv data on bidirectional stream: '+bidiStreamCount+' : ' + data);
        addToEventLog('Done accepting bidirectional streams!');
        
        return;
      }
      data = value;
      //readFromIncomingStream(stream, number);
    }
  } catch (e) {
    addToEventLog('Error while accepting streams: ' + e, 'error');
  }
}

async function readFromIncomingStream(stream, number) {
  let decoder = new TextDecoderStream('utf-8');
  let reader = stream.pipeThrough(decoder).getReader();
  // let reader = stream.getReader();
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        addToEventLog('Stream #' + number + ' closed');
        return;
      }
      let data = value;
      console.log("value size: ", value.length);
      addToEventLog('Received data on stream #' + number + ': ' + data);
    }
  } catch (e) {
    addToEventLog(
      'Error while reading from stream #' + number + ': ' + e, 'error');
    addToEventLog('    ' + e.message);
  }
}

function addToEventLog(text, severity = 'info') {
  let log = document.getElementById('event-log');
  let mostRecentEntry = log.lastElementChild;
  let entry = document.createElement('li');
  entry.innerText = text;
  entry.className = 'log-' + severity;
  log.appendChild(entry);

  // If the most recent entry in the log was visible, scroll the log to the
  // newly added element.
  if (mostRecentEntry != null &&
    mostRecentEntry.getBoundingClientRect().top <
    log.getBoundingClientRect().bottom) {
    entry.scrollIntoView();
  }
}

// 随机生成字符串 给输入框
function generateRandomString() {

  let form = document.forms.sending.elements;
  let randomLength = 10;
  let characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  let charactersLength = characters.length;
  for (let i = 0; i < randomLength; i++) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
  }
  form.data.value = result;
}