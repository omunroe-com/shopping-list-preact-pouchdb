import {h, Component} from "preact";
import {List} from "immutable";
import {ShoppingListFactory, ShoppingListRepositoryPouchDB} from "ibm-shopping-list-model";
import ShoppingList from "./components/ShoppingList";
import ShoppingLists from "./components/ShoppingLists";

const NOLISTMSG = "Click the + sign above to create a shopping list."
const NOITEMSMSG = "Click the + sign above to create a shopping list item."

const appBarStyle = {
  width: "100%", 
};

class App extends Component {
  constructor(props) {
    super(props);
    this.state = {
      shoppingList: null, 
      shoppingLists: [], 
      totalShoppingListItemCount: List(), //Immutable.js List with list ids as keys
      checkedTotalShoppingListItemCount: List(), //Immutable.js List with list ids as keys
      shoppingListItems: null, 
      adding: false, 
      view: "lists",
      newName: ""
    }
  }

  componentDidMount = () => {
      this.getShoppingLists();
      this.props.localDB.sync(this.props.remoteDB, {live: true, retry: true})
        .on("change", change => {
          // console.log("something changed!");
          this.getPouchDocs();
        })
        // .on("paused", info => console.log("replication paused."))
        // .on("active", info => console.log("replication resumed."))
        .on("error", err => console.log("uh oh! an error occured."));
  }

  getShoppingLists = () => {
    let checkedCount = List();
    let totalCount = List();
    let lists = null;
    this.props.shoppingListRepository.find().then( foundLists => {
      lists = foundLists;
      return foundLists;
    }).then( foundLists => {
      return this.props.shoppingListRepository.findItemsCountByList();
    }).then( countsList => { 
      totalCount = countsList;
      return this.props.shoppingListRepository.findItemsCountByList({
        selector: {
          type: "item", 
          checked: true
        },
        fields: ["list"]
      });
    }).then( checkedList => {
      checkedCount = checkedList;
      this.setState({
        view: "lists", 
        shoppingLists: lists, 
        shoppingList: null,
        shoppingListItems: null, 
        checkedTotalShoppingListItemCount: checkedCount, 
        totalShoppingListItemCount: totalCount
      });
    }).catch( err => {
      console.log("ERROR in getShoppingLists");
      console.log(err);
    });
  }

  openShoppingList = (listid) => {
    this.props.shoppingListRepository.get(listid).then( list => {
      return list;
    }).then(list => {
      this.getShoppingListItems(listid).then(items => {
        this.setState({
          view: "items", 
          shoppingList: list,
          shoppingListItems: items
        });
      });
    });
  }

  getShoppingListItems = (listid) => {
    return this.props.shoppingListRepository.findItems({
      selector: {
        type: "item", 
        list: listid
      }
    });
  }

  refreshShoppingListItems = (listid) => {
    this.props.shoppingListRepository.findItems({
      selector: {
        type: "item", 
        list: listid
      }
    }).then(items => {
      this.setState({
        view: "items", 
        shoppingListItems: items
      });
    });
  }

  renameShoppingListItem = (itemid, newname) => {
    console.log("IN renameShoppingListItem with id="+itemid+", name="+newname);
    this.props.shoppingListRepository.getItem(itemid).then(item => {
      item = item.set("title", newname);
      return this.props.shoppingListRepository.putItem(item);
    }).then(this.refreshShoppingListItems(this.state.shoppingList._id));
  }

  deleteShoppingListItem = (itemid) => {
    this.props.shoppingListRepository.getItem(itemid).then(item => {
      return this.props.shoppingListRepository.deleteItem(item);
    }).then(this.refreshShoppingListItems(this.state.shoppingList._id));
  }

  toggleItemCheck = (itemid) => {
    this.props.shoppingListRepository.getItem(itemid).then(item => {
      item = item.set("checked", !item.checked);
      return this.props.shoppingListRepository.putItem(item);
    }).then(this.refreshShoppingListItems(this.state.shoppingList._id));
  }

  checkAllListItems = (listid) => {
    let listcheck = true;
    this.getShoppingListItems(listid).then( items => {
      let newitems = [];
      items.forEach(item => {
        if (!item.checked) {
          newitems.push( item.mergeDeep({checked:true}) );
        }
      }, this);
      // if all items were already checked let's uncheck them all
      if (newitems.length == 0) {
        listcheck = false;
        items.forEach(item => {
          newitems.push( item.mergeDeep({checked:false}) );
        }, this);
      }
      let listOfShoppingListItems = this.props.shoppingListFactory.newListOfShoppingListItems(newitems);
      return this.props.shoppingListRepository.putItemsBulk(listOfShoppingListItems);
    }).then(newitemsresponse => {
      return this.props.shoppingListRepository.get(listid);
    }).then(shoppingList => {
      shoppingList = shoppingList.set("checked", listcheck);
      return this.props.shoppingListRepository.put(shoppingList);
    }).then(shoppingList => {
      this.getShoppingLists();
    });
  }

  deleteShoppingList = (listid) => {
    this.props.shoppingListRepository.get(listid).then(shoppingList => {
      shoppingList = shoppingList.set("_deleted", true);
      return this.props.shoppingListRepository.put(shoppingList);
    }).then(result => {
      this.getShoppingLists();
    });
  }

  renameShoppingList = (listid, newname) => {
    console.log("HERE IN renameShoppingList with id="+listid+", title="+newname);
    this.props.shoppingListRepository.get(listid).then(shoppingList => {
      shoppingList = shoppingList.set("title", newname);
      return this.props.shoppingListRepository.put(shoppingList);
    }).then(this.getShoppingLists);
  }

  createNewShoppingListOrItem = (e) => {
    e.preventDefault();
    this.setState({adding: false});
    
    if (this.state.view === "lists") {
      let shoppingList = this.props.shoppingListFactory.newShoppingList({
        title: this.state.newName
      });
      this.props.shoppingListRepository.put(shoppingList).then(this.getShoppingLists);

    } else if (this.state.view === "items") {
      let item = this.props.shoppingListFactory.newShoppingListItem({
        title: this.state.newName
      }, this.state.shoppingList);
      this.props.shoppingListRepository.putItem(item).then(item => {
        this.getShoppingListItems(this.state.shoppingList._id).then(items => {
          this.setState({
            view: "items", 
            shoppingListItems: items
          });
        });
      });
    }
  }

  updateName = (e) => {
    this.setState({newName: e.target.value});
  }

  displayAddingUI = () => {
    this.setState({adding: true});
  }

  renderNewNameUI = () => {
    return (
      <form onSubmit={this.createNewShoppingListOrItem} style={{marginTop:"12px"}}>
        <div class="input-field">
            <input className="validate" type="text" 
              placeholder="Name..." id="input-name" 
              onChange={this.updateName} 
              fullWidth={false} 
              style={{padding:"0px 12px",width:"calc(100% - 24px)"}}
              underlineStyle={{width:"calc(100% - 24px)"}}/>
            {/* <label for="input-name">Name</label> */}
        </div>
      </form>
    );
  }

  renderShoppingLists = () => {
    if (this.state.shoppingLists.length < 1)
      return ( <h5>{NOLISTMSG}</h5> );
    return (
      <ShoppingLists 
        shoppingLists={this.state.shoppingLists} 
        openListFunc={this.openShoppingList} 
        deleteListFunc={this.deleteShoppingList} 
        renameListFunc={this.renameShoppingList} 
        checkAllFunc={this.checkAllListItems}
        totalCounts={this.state.totalShoppingListItemCount}
        checkedCounts={this.state.checkedTotalShoppingListItemCount} /> 
    )
  }

  renderShoppingListItems = () => {
    if (this.state.shoppingListItems.size < 1) 
      return ( <h5>{NOITEMSMSG}</h5> );
    return (
      <ShoppingList 
        shoppingListItems={this.state.shoppingListItems} 
        deleteFunc={this.deleteShoppingListItem} 
        toggleItemCheckFunc={this.toggleItemCheck} 
        renameItemFunc={this.renameShoppingListItem} /> 
    )
  }

  renderBackButton = () => {
    if (this.state.view === "items") 
      return (
        <a className="btn-flat btn-large white-text" onClick={this.getShoppingLists} style={{"padding":"0px","vertical-align":"middle"}}>
          <i className="material-icons">keyboard_backspace</i>
        </a>)
    else 
      return <span/>;
  }

  render() {
    let screenname = "Shopping Lists";
    if (this.state.view === "items") screenname = this.state.shoppingList.title;
    return (
      <div className="App">
        <nav>
          <div className="nav-wrapper">
            <div className="brand-logo left">
                {this.renderBackButton()}
                <span className="hide-on-small-only">{screenname}</span>
                <span className="show-on-medium-and-up" style={{"font-size":"14pt"}}>{screenname}</span>
            </div>
            <div className="right">
              <a className="btn-floating" style={{"margin-right":"8px"}}
                onClick={this.displayAddingUI}>
                <i className="material-icons" style={{"line-height":"unset"}}>add</i>
              </a>
            </div>
          </div>
        </nav>
        <div className="listsanditems container" style={{margin:"8px"}}>
          {this.state.adding ? this.renderNewNameUI() : <span/>}
          {this.state.view === "lists" ? this.renderShoppingLists() : this.renderShoppingListItems()}
        </div>
      </div>
    )
  }
}

export default App;