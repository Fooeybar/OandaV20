module.exports=function(apikey='',host='api-fxtrade.oanda.com'){
    return (()=>{
        let https=require('https');
        let defaults={
            id:'',
            instrument:'',
            interval:1000
        };
        let close_defaults={
            instrument:'',
            datetime:'RFC3339',
            long:0,
            longID:'oandav20',
            longTag:'oandav20',
            longComment:'oandav20',
            short:0,shortID:'oandav20',
            shortTag:'oandav20',
            shortComment:'oandav20'
        };
        let instrument_format=function(pair){
            pair=pair.toUpperCase();
            if(pair.length===6)pair=pair[0]+pair[1]+pair[2]+'_'+pair[3]+pair[4]+pair[5];
            else if(pair[3]!=='_')pair=pair[0]+pair[1]+pair[2]+'_'+pair[4]+pair[5]+pair[6];
            return pair;
        };

        class Position{
            httpsTime;
            httpsStatus;
            count;
            resume;
            pause;
            close;
            #refresh;
            #format;
            #timeout;

            constructor(config=defaults){
                if(config===undefined||config.id===undefined)return 'Position.constructor -> object with account id required, ex: new Position({id:xxx-xxx-xxxxxx-xxx});';
                if(config.instrument===undefined)config.instrument=defaults.instrument;
                else config.instrument=instrument_format(config.instrument);
                if(config.interval==null||!Number.isInteger(config.interval))config.interval=defaults.interval;

                Object.defineProperty(this,'config',{value:config,enumerable:false,writable:false,configurable:false});

                this.count=0;

                this.close=function close(options=close_defaults,callback=function callback(data){return data;}){
                    if(options===undefined||typeof options!=='object')return callback('Position.close -> options argument must be object');
                    if(typeof this[0]==='string')return callback('Position.close -> no positions to close');
                    if((options.long==null||options.long==0)&&(options.short==null||options.short==0))return callback('Position.close -> no units (long|short)');
                    if(options.body==null){
                        options.body={};
                        if(options.long){
                            options.body.longUnits=''+options.long;
                            options.body.longClientExtensions={
                                id:options.longID||'oandav20',
                                tag:options.longTag||'oandav20',
                                comment:options.longComment||'from oandav20'
                            };
                        }
                        if(options.short){
                            options.body.shortUnits=''+options.short;
                            options.body.shortClientExtensions={
                                id:options.shortID||'oandav20',
                                tag:options.shortTag||'oandav20',
                                comment:options.shortComment||'from oandav20'
                            };
                        }
                    }
                    if(options.datetime==null)options.datetime='RFC3339';
                    if(options.instrument==null)options.instrument='';
                    let put=(_instrument,_datetime,_body,_cb)=>{
                        https.request({
                            host:host,method:'PUT',path:'/v3/accounts/'+config.id+'/positions/'+_instrument+'/close',
                            headers:{
                                'Authorization':'Bearer '+apikey
                                ,'Content-Type':'application/json; charset=UTF-8'
                                ,'Accept-Encoding':'utf-8'
                                ,'Accept-Datetime-Format':_datetime
                                }
                            },
                            (res)=>{
                                let data='';
                                res.on('data',(chunk)=>{data+=(''+chunk).replace(',,',',');});
                                res.on('end',()=>{_cb(JSON.parse(data));});
                            }//---res
                        ).end(JSON.stringify(_body));
                    }
                    if(config.instrument!=='')return put(config.instrument,options.datetime,options.body,callback);// this
                    else if(options.instrument!==''){// one
                        options.instrument=instrument_format(options.instrument);
                        return put(options.instrument,options.datetime,options.body,callback);
                    }
                    else{// all
                        let ret_all={},counter=0;
                        for(let i=0;i<this.count;i++){
                            put(this[i].instrument,options.datetime,options.body,(data)=>{
                                ret_all[i]=data;
                                if(counter++>=this.count-1)return callback(ret_all);
                            });
                        }
                    }
                };//---close

                Object.defineProperty(this.close,'defaults',{enumerable:false,writable:true,configurable:false,value:close_defaults});

                this.pause=function pause(){clearTimeout(this.#timeout);this.#timeout='no timeout';};
                this.resume=function resume(){this.#refresh();};
                
                this.#refresh=(init=false)=>{
                    this.httpsTime=Date.now();
                    https.get(
                        {
                            hostname:host,
                            path:'/v3/accounts/'+config.id+'/openPositions',
                            headers:{
                                'Authorization':'Bearer '+apikey
                                ,'Content-Type':'application/json; charset=UTF-8'
                                ,'Accept-Encoding':'utf-8'
                            }
                        },
                        (res)=>{
                            this.httpsStatus=res.statusCode;
                            let data='';
                            res.on('data',(chunk)=>{data+=(''+chunk).replace(',,',',');});
                            res.on('end',()=>{
                                data=JSON.parse(data).positions;
                                if(res.statusCode===200)this.#format(data);
                                else this.error=data;
                            });//---res.end
                        }//---res
                    );//---https.get
                    this.#timeout=setTimeout(this.#refresh,config.interval);
                };
                
                this.#format=(obj)=>{ 
                    if(config.instrument!==''){   //match instrument
                        for(let i=0;i<obj.length;i++){
                            if(obj[i].instrument!==config.instrument)continue;
                            if(this.count===1){
                                delete this.long;
                                delete this.short;
                                delete this.pl;
                                delete this.resettablePL;
                                delete this.unrealizedPL;
                                delete this.financing;
                                delete this.dividendAdjustment;
                                delete this.guaranteedExecutionFees;
                                this.count=0;
                            }
                            this.long=obj[i].long;
                            this.short=obj[i].short;
                            this.pl=obj[i].pl;
                            this.resettablePL=obj[i].resettablePL;
                            this.unrealizedPL=obj[i].unrealizedPL;
                            this.financing=obj[i].financing;
                            this.dividendAdjustment=obj[i].dividendAdjustment;
                            this.guaranteedExecutionFees=obj[i].guaranteedExecutionFees;
                            this.count=1;
                            break;
                        }
                        if(this.count==0)this.error='instrument not found || position not open';
                    }
                    else{
                        for(let i=this.count-1;i>=0;i--){delete this[i];}
                        this[0]='no positions';
                        for(let i=0;i<obj.length;i++){this[i]=obj[i];}
                        this.count=obj.length;
                    }
                };

                this.#refresh(true);
            }
        };

        Object.defineProperty(Position,'defaults',{enumerable:true,writable:true,configurable:false,value:defaults});

        return Position;
    })();
};